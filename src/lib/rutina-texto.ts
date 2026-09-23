/**
 * RUTINAS COMO TEXTO (098): leer lo que el trainer ya tiene escrito y
 * devolverlo como texto para WhatsApp.
 *
 * Un trainer no arranca de cero: tiene sus rutinas en Notas, en un Excel o
 * en un chat de WhatsApp. «Pegar texto» las convierte en días y ejercicios,
 * y el renglón rápido del editor hace lo mismo con una sola línea
 * («Press banca 4x10 40kg 90s» + Enter = una tarjeta). Al revés, «Copiar
 * como texto» y «Mandar por WhatsApp» arman el texto para el cliente que no
 * abre links.
 *
 * Las reglas que no se negocian:
 *
 * - NUNCA se agrega una unidad a la carga. En muchos gimnasios de la región
 *   las mancuernas vienen en libras y las máquinas se cargan por placa: un
 *   «25» que el cliente lee como «25 kg» cuando eran libras lo puede
 *   lastimar. «40» queda «40»; lo único que se toca es la forma de lo que ya
 *   estaba escrito («40kg» → «40 kg», «20 lbs» → «20 lb», «7 placas» →
 *   «placa 7»).
 * - Lo que no se entiende no se inventa: un renglón que no es un día, ni un
 *   ejercicio, ni una nota va a `noEntendidas` y la pantalla lo muestra tal
 *   cual. Lo que sobra DENTRO de un ejercicio («Sentadilla 4x10 bajar
 *   lento») queda en su nota, que es texto que el trainer ve y corrige.
 * - Lo que exporta `rutinaComoTexto` se vuelve a leer igual con
 *   `leerRutina` (la prueba lo verifica): así, un trainer que copia una
 *   rutina de Orden y la pega en otra cuenta no pierde nada.
 *
 * Es un intérprete fijo, sin IA: reglas chicas y probadas contra rutinas
 * reales (pruebas/rutinas-texto.test.js). Lee español y portugués, emojis,
 * viñetas, numeración, días en mayúsculas, «4 series de 12», «3x12-10-8»,
 * «c/lado», libras, «1:30», planillas de Excel con encabezado…
 *
 * Adentro no hay textos de pantalla: las palabras que se escriben al
 * exportar («series», «Descanso»…) llegan en `t` desde el diccionario. Las
 * que se reconocen al leer son patrones, en los dos idiomas a la vez.
 *
 * Este archivo NO importa nada del servidor ni de React: se compila suelto
 * para las pruebas (ver "probar:calculos" en package.json). Tampoco usa
 * «lookbehind» en las expresiones regulares: un iPhone con iOS anterior al
 * 16.4 no lo entiende y rompería el editor entero al cargar.
 */
import type { EjercicioLeido, RutinaLeida, TextosRutinaTexto } from './tipos-rutinas';
import { buscarBase } from './ejercicios-base';

/** Los topes de la base (checks de la 098), para que la pantalla los respete antes de guardar. */
export const LARGOS = {
  nombreRutina: 60,
  notasRutina: 1000,
  nombreDia: 40,
  notasDia: 500,
  ejercicio: 80,
  reps: 20,
  carga: 24,
  nota: 200,
} as const;

export type UnidadCarga = 'kg' | 'lb' | 'placa' | 'corporal';
export const UNIDADES_CARGA: UnidadCarga[] = ['kg', 'lb', 'placa', 'corporal'];

// ─────────────────────────── utilidades de texto ───────────────────────────

const SIN_TILDE: Record<string, string> = {
  á: 'a', à: 'a', â: 'a', ã: 'a', ä: 'a',
  é: 'e', è: 'e', ê: 'e', ë: 'e',
  í: 'i', ì: 'i', î: 'i', ï: 'i',
  ó: 'o', ò: 'o', ô: 'o', õ: 'o', ö: 'o',
  ú: 'u', ù: 'u', û: 'u', ü: 'u',
  ñ: 'n', ç: 'c',
};

/**
 * Minúsculas y sin tildes, letra por letra: el resultado tiene EXACTAMENTE
 * el mismo largo que el original. Los patrones se buscan en esta versión y
 * lo encontrado se recorta del original, así el nombre del ejercicio
 * conserva sus mayúsculas y sus tildes.
 */
function plegar(s: string): string {
  let r = '';
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    const l = c.toLowerCase();
    r += l.length === 1 ? (SIN_TILDE[l] ?? l) : c;
  }
  return r;
}

const RE_EMOJI = /[\p{Extended_Pictographic}\u{1F1E6}-\u{1F1FF}\u{1F3FB}-\u{1F3FF}︎️‍⃣]/gu;

/**
 * Lo que no cambia el sentido de un renglón y sí estorba para leerlo:
 * espacios raros, emojis, comillas tipográficas, «×» y el «1️⃣» de WhatsApp
 * (que es una numeración: «1.»). El reloj «⏱ 1:30» es un descanso.
 */
function limpiar(s: string): string {
  return s
    .replace(/[  -   ]/g, ' ')
    .replace(/(\d)️?⃣/g, '$1. ')
    .replace(/\u{1F51F}/gu, '10. ')
    .replace(/[⏱⏲⏰⌛⏳]️?\s*(?=\d)/g, ' descanso ')
    .replace(/(\d)\s*(?:[×✕⨯]|✖️?)\s*/g, '$1x')
    .replace(/(\d)\s*\*\s*(?=\d)/g, '$1x')
    .replace(RE_EMOJI, '')
    .replace(/[″“”„]/g, '"')
    .replace(/[′‘’´`]/g, "'")
    .replace(/[−‐‑‒]/g, '-')
    // «8–12» pegado es un rango; con espacios («de 12 – 10 kg») separa dos datos.
    .replace(/(\d)–(?=\d)/g, '$1-')
    // «3x12x10kg», «3 x 12 x 20kg»: la segunda «x» separa la carga. Sin esto
    // la carga quedaba en la nota («x10kg»). «2x10kg» (dos mancuernas) no
    // cambia: no tiene una «x» antes.
    .replace(/(\d{1,2}\s*x\s*\d{1,3}(?:\s*[-/]\s*\d{1,3})*)\s*x\s*(?=\d)/gi, '$1 ')
    // El guion con espacios es el separador de WhatsApp: «4x10 - 60»,
    // «3x10 - 1 min». Es un rango solo si lo parece (ver `guionEntreNumeros`).
    .replace(RE_GUION, guionEntreNumeros)
    .replace(/[ \t]+/g, ' ')
    .trim();
}

const RE_GUION = /(\d+(?:[.,]\d+)?)((?:\s+-\s+\d+(?:[.,]\d+)?)+)(?![\d.,])(\s*(?:kgs?|kilos?|quilos?|lbs?|libras?|minutos?|mins?|segundos?|segs?|s|"|'|%)(?![a-záéíóúñç]))?/gi;

/**
 * «8 - 12» con espacios: ¿un rango, o datos separados por un guion?
 *
 * Un rango o una pirámide van en un solo sentido y a pasos cortos (ninguno
 * duplica al anterior): «8 - 12», «40 - 50 kg», «30 - 45 s», «12 - 10 - 8»,
 * «6 - 8 - 10». Con dos números, además, tiene que subir (y sin unidad, no
 * pasar de 30): «12 - 10 kg» son las repeticiones y la carga. Lo demás son
 * datos separados —«4x10 - 60» (la carga), «3x10 - 1 min» (el descanso),
 * «10 - 60 - 90s»— y el guion pasa a ser la raya con espacios, que separa.
 */
function guionEntreNumeros(todo: string, primero: string, resto: string, unidad: string | undefined): string {
  const textos = [primero, ...resto.split(/\s+-\s+/).filter(Boolean)];
  const n = textos.map((t) => +t.replace(',', '.'));
  const pasos = n.slice(1).map((y, i) => [n[i], y]);
  const sube = pasos.every(([x, y]) => y > x && y <= 2 * x);
  const baja = pasos.every(([x, y]) => y < x && x <= 2 * y);
  const rango = n.length === 2
    ? sube && (unidad !== undefined || n[1] <= 30)
    : (sube || baja) && (unidad !== undefined || Math.max(...n) <= 30);
  return `${textos.join(rango ? '-' : ' – ')}${unidad ?? ''}`;
}

/** Negritas, tachados e itálicas de WhatsApp adentro del renglón. */
function quitarFormato(s: string): string {
  return s
    .replace(/\*/g, '')
    .replace(/~([^~]+)~/g, '$1')
    .replace(/(^|[\s(])_([^_]+?)_(?=$|[\s).,;:!?])/g, '$1$2')
    .replace(/\s+/g, ' ')
    .trim();
}

const tieneLetra = (s: string) => /\p{L}/u.test(s);

// Palabras que unen y que no pueden quedar colgando al final de un nombre:
// «Remo con banda roja 3x15» da «Remo» con carga «banda roja», no «Remo con».
const RE_CONECTOR_FINAL = /\s+(?:con|com|de|del|do|da|y|e|en|no|na|a|al|ao|c\/|por|x|@|\+)$/i;
// En una nota las palabras se quedan («con botellas de 1 litro»); solo se
// saca un «x» o un «@» que quedó suelto de un número ya leído.
const RE_CONECTOR_INICIAL = /^(?:x|@|\+)\s+/i;

/** Un pedazo de renglón sin separadores ni conectores en los bordes. */
function limpiarTrozo(s: string, esNombre: boolean): string {
  let t = s.replace(/\s+/g, ' ').trim();
  t = t.replace(/\(\s*\)|\[\s*\]/g, ' ').replace(/\s+/g, ' ').trim();
  for (let i = 0; i < 4; i++) {
    const antes = t;
    t = t.replace(/^[\s\-–—:|·,;/.=>+]+/, '').replace(/[\s\-–—:|·,;/=+@]+$/, '');
    t = t.replace(RE_CONECTOR_FINAL, '');
    if (!esNombre) t = t.replace(RE_CONECTOR_INICIAL, '');
    // Un paréntesis que quedó sin su pareja porque lo de adentro se leyó.
    const abre = (t.match(/\(/g) ?? []).length, cierra = (t.match(/\)/g) ?? []).length;
    if (abre > cierra) t = t.replace(/\(([^()]*)$/, '$1');
    if (cierra > abre) t = t.replace(/^([^()]*)\)/, '$1');
    if (!esNombre && /^\([^()]*\)$/.test(t)) t = t.slice(1, -1);
    t = t.trim();
    if (t === antes) break;
  }
  // Un pedazo que es solo un conector («3 series de 15 con 5 kg» deja «con»
  // entre los dos datos) no es una nota: el cliente leería «Nota: con».
  if (!esNombre && RE_CONECTOR_SOLO.test(t)) t = '';
  return t;
}

const RE_CONECTOR_SOLO = /^(?:con|com|de|del|do|da|y|e|en|no|na|a|al|ao|x|por|@|\+)$/i;

// ─────────────────────────── normalizar carga, reps y descanso ───────────────────────────

const UNIDAD_PESO = 'kgs?|kilos?|quilos?|lbs?|libras?';

/**
 * La carga como la escribió el trainer, con la forma prolija. NUNCA le
 * agrega una unidad que no estaba: «40» sigue siendo «40».
 *   «40kg», «40 KG», «40 kilos» → «40 kg» · «20 lbs», «20 libras» → «20 lb»
 *   «placa7», «7 placas» → «placa 7» · «40 - 50 kg» → «40-50 kg»
 *   «peso del cuerpo», «peso do corpo» → «peso corporal»
 */
export function normalizarCarga(texto: string | null | undefined): string {
  let s = (texto ?? '').replace(/\s+/g, ' ').trim();
  s = s.replace(/^@\s*/, '');
  s = s.replace(/(\d)\s*(?:kgs?|kilos?|quilos?)(?![a-záéíóúñç])/gi, '$1 kg');
  s = s.replace(/(\d)\s*(?:lbs?|libras?)(?![a-záéíóúñç])/gi, '$1 lb');
  s = s.replace(/\bplacas?\s*(?:n[°º.]?\s*|#\s*|:\s*)?(\d{1,2})\b/gi, 'placa $1');
  s = s.replace(/^(\d{1,2})\s*placas?$/i, 'placa $1');
  s = s.replace(/\bpeso\s+(?:del\s+cuerpo|do\s+corpo)\b/gi, 'peso corporal');
  s = s.replace(/(\d)\s*([-/])\s*(?=\d)/g, '$1$2');
  s = s.replace(/\bc\s*\/\s*(?=\S)/gi, 'c/');
  return s;
}

/**
 * Las repeticiones con la forma prolija: «45s», «45 seg», «45"» → «45 s»;
 * «1min», «1 minuto» → «1 min»; «1'30» → «1:30»; «8 - 12» → «8-12»;
 * «c/ lado» → «c/lado»; «12 reps» → «12». El resto queda como estaba
 * («al fallo», «12-10-8», «AMRAP»).
 */
export function normalizarReps(texto: string | null | undefined): string {
  let s = (texto ?? '').replace(/\s+/g, ' ').trim();
  s = s.replace(/(\d{1,2})\s*'\s*(\d{2})\s*(?:"|'')?/g, '$1:$2');
  s = s.replace(/(\d)\s*(?:segundos?|segs?|s|"|'')(?![a-záéíóúñç])/gi, '$1 s');
  s = s.replace(/(\d)\s*(?:minutos?|mins?|')(?![a-záéíóúñç])/gi, '$1 min');
  s = s.replace(/(\d)\s*([-/])\s*(?=\d)/g, '$1$2');
  s = s.replace(/\bc\s*\/\s*(?=\S)/gi, 'c/');
  s = s.replace(/\s*\b(?:reps?|repeticiones|repeticion|repetici[oó]n|repeti[cç][oõ]es|repeti[cç][aã]o)\.?$/i, '');
  return s.trim();
}

/**
 * Un descanso escrito a mano, en segundos, o null si no se entiende.
 * «90», «90s», «90 seg», «90"», «1:30», «1'30», «1 min», «1,5 min»,
 * «1 min 30 s», «1 minuto y medio», «2'». Un número solo vale como segundos desde 10: un
 * «descanso 2» es casi seguro 2 minutos, y en la duda no se adivina.
 * `porDefecto` es la unidad del encabezado de una planilla («Descanso
 * (min)»): ahí un número solo sí tiene unidad. Tope: 900 s, el de la base.
 */
export function leerDescanso(texto: string | null | undefined, porDefecto: 's' | 'min' | null = null): number | null {
  const f = plegar((texto ?? '').trim()).replace(/[″“”„]/g, '"').replace(/[′‘’´`]/g, "'")
    .replace(/\s+/g, ' ').replace(',', '.');
  if (!f) return null;
  let seg: number | null = null;
  let m: RegExpExecArray | null;
  if ((m = /^(\d{1,2}) ?: ?(\d{2})$/.exec(f))) {
    if (+m[2] < 60) seg = +m[1] * 60 + +m[2];
  } else if ((m = /^(\d{1,2}) ?' ?(\d{1,2}) ?(?:"|'')?$/.exec(f))) {
    if (+m[2] < 60) seg = +m[1] * 60 + +m[2];
  } else if ((m = /^(\d+(?:\.\d+)?) ?(?:segundos?|segs?|s|"|'')$/.exec(f))) {
    seg = +m[1];
  } else if ((m = /^(\d+(?:\.\d+)?) ?(?:minutos?|mins?|m|')(?: ?(\d{1,2}) ?(?:segundos?|segs?|s|"|'')?| (?:y|e) (medio|meio))?$/.exec(f))) {
    // «1 minuto y medio» / «1 minuto e meio»: un minuto y treinta.
    seg = +m[1] * 60 + (m[2] ? +m[2] : 0) + (m[3] ? 30 : 0);
  } else if ((m = /^(\d+(?:\.\d+)?)$/.exec(f))) {
    const n = +m[1];
    if (porDefecto === 'min') seg = n * 60;
    else if (porDefecto === 's' || (n >= 10 && Number.isInteger(n))) seg = n;
  }
  if (seg === null || !Number.isFinite(seg)) return null;
  seg = Math.round(seg);
  return seg >= 0 && seg <= 900 ? seg : null;
}

/** El descanso para mostrar: «45 s», «2 min», «1:30». Vacío si no hay. */
export function formatoDescanso(seg: number | null | undefined): string {
  if (seg === null || seg === undefined || !Number.isFinite(seg)) return '';
  const s = Math.max(0, Math.round(seg));
  if (s < 60) return `${s} s`;
  if (s % 60 === 0) return `${s / 60} min`;
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/**
 * Los botones de unidad del editor (kg · lb · placa · peso corporal):
 * escriben la unidad en el texto de la carga, sobre el número que ya está.
 * No convierten: si decía «40 kg» y se toca «lb», queda «40 lb», porque lo
 * que se está corrigiendo es la unidad, no el peso.
 *   conUnidad('40', 'kg') → '40 kg' · conUnidad('placa 7', 'kg') → '7 kg'
 *   conUnidad('7', 'placa') → 'placa 7' · conUnidad('', 'corporal') → 'peso corporal'
 * Sin un número no hay a qué ponerle unidad y la carga queda como estaba
 * (salvo «peso corporal», que se vacía para escribir el número).
 */
export function conUnidad(carga: string | null | undefined, unidad: UnidadCarga): string {
  const s = normalizarCarga(carga);
  if (unidad === 'corporal') return 'peso corporal';
  const m = /\d+(?:[.,]\d+)?(?:\s*[-/x]\s*\d+(?:[.,]\d+)?)*/i.exec(s);
  if (!m) return /^peso corporal$/i.test(s) ? '' : s;
  const numero = m[0];
  const antes = s.slice(0, m.index).replace(/\bplacas?\s*$/i, '').trim();
  const despues = s.slice(m.index + numero.length).replace(/^\s*(?:kg|lb)(?![a-z])/i, '').trim();
  const base = unidad === 'placa' ? `placa ${numero}` : `${numero} ${unidad}`;
  return [antes, base, despues].filter(Boolean).join(' ');
}

/** Qué botón de unidad está prendido para esta carga, o null si no tiene ninguna. */
export function unidadDe(carga: string | null | undefined): UnidadCarga | null {
  const s = normalizarCarga(carga).toLowerCase();
  if (/\d\s*kg\b/.test(s)) return 'kg';
  if (/\d\s*lb\b/.test(s)) return 'lb';
  if (/\bplaca\s*\d/.test(s)) return 'placa';
  if (/^peso corporal$/.test(s)) return 'corporal';
  return null;
}

// ─────────────────────────── leer un renglón ───────────────────────────

// Los patrones se buscan en el texto plegado (sin tildes, en minúsculas).
const NUMS = '\\d+(?:[.,]\\d+)?(?:\\s*(?:-|/|x|a)\\s*\\d+(?:[.,]\\d+)?)*';
const REPS_NUM = '\\d{1,3}(?:\\s*(?:-|/|a)\\s*\\d{1,3})*';
const UNIDAD_TIEMPO = `(?:segundos?|segs?|s|"|''|minutos?|mins?|')(?![a-z])`;
const LADO = '(?:c\\s*/\\s*(?:lado|l|pierna|brazo|perna|braco|mano|mao)\\b|(?:por|cada|de\\s+cada|p\\s*/)\\s*(?:lado|pierna|brazo|perna|braco|mano|mao)\\b)';
const LADO_CARGA = '(?:c\\s*/\\s*(?:lado|u|mancuerna|halter|mano|mao|brazo|braco)\\b|(?:cada|por|de\\s+cada|en\\s+cada|em\\s+cada)\\s+(?:lado|uno|una|mancuerna|halter|mano|mao|brazo|braco)\\b)';
const PALABRA_REPS = '(?:al\\s+fallo|hasta\\s+el\\s+fallo|hasta\\s+la\\s+falla|fallo|al\\s+maximo|maximo|max|amrap|ate\\s+(?:a\\s+)?falha|falha)\\b';
const REPS = `(?:${REPS_NUM}(?:\\s*${UNIDAD_TIEMPO})?(?:\\s*${LADO})?|${PALABRA_REPS})`;
const SIN_PESO = `(?![\\d.,])(?!\\s*(?:${UNIDAD_PESO})(?![a-z]))`;
const SUF_REPS = '(?:\\s*(?:reps?|repeticiones|repeticion|repeticoes|repeticao)\\b\\.?)?';
// «1 min 30 s», y también «1 minuto y medio» / «1 minuto e meio».
const Y_MEDIO = `(?:\\s*\\d{1,2}\\s*(?:segundos?|segs?|s|"|'')|\\s+(?:y|e)\\s+(?:medio|meio))?`;
const DUR = `(?:\\d{1,2}\\s*:\\s*\\d{2}|\\d{1,2}\\s*'\\s*\\d{1,2}\\s*(?:"|'')?|\\d+(?:[.,]\\d+)?\\s*(?:segundos?|segs?|s|"|'')|\\d+(?:[.,]\\d+)?\\s*(?:minutos?|mins?|')${Y_MEDIO})(?![a-z\\d])`;
const DUR_ETQ = `(?:\\d{1,2}\\s*:\\s*\\d{2}|\\d{1,2}\\s*'\\s*\\d{1,2}\\s*(?:"|'')?|\\d+(?:[.,]\\d+)?\\s*(?:segundos?|segs?|s|"|'')|\\d+(?:[.,]\\d+)?\\s*(?:minutos?|mins?|m|')${Y_MEDIO}|\\d{1,3})(?![a-z\\d.,])(?!\\s*(?:-|/|a)\\s*\\d)`;
const COLORES = 'roja|rojo|verde|azul|negra|negro|amarilla|amarillo|violeta|lila|gris|naranja|celeste|rosa|morada|vermelha|vermelho|amarela|amarelo|preta|preto|roxa|roxo|cinza|laranja|leve|liviana|liviano|suave|media|mediana|fuerte|forte|dura|extra\\s+fuerte|extra\\s+forte';

const RE = {
  junto: /\b(?:(?:super\s*-?\s*serie|bi\s*-?\s*serie|bi\s*-?\s*set|conjugado|junto)\s+)?(?:con|com|al|ao)\s+(?:el\s+|o\s+)?anterior\b/g,
  descansoEtq: new RegExp(`\\b(?:descanso|descansar|desc\\.?|pausa|intervalo|rest|recuperacion|recuperacao)\\s*(?:de\\s+)?[:=]?\\s*(${DUR_ETQ})`, 'g'),
  descansoPost: new RegExp(`\\b(${DUR})\\s*(?:de\\s+)?(?:descanso|pausa|intervalo)\\b`, 'g'),
  // «descanso 60-90 s»: un rango no es UN descanso; queda entero en la nota.
  descansoRango: new RegExp(`\\b(?:descanso|descansar|desc\\.?|pausa|intervalo|rest)\\s*[:=]?\\s*\\d+(?:[.,]\\d+)?(?:\\s*(?:-|/|a)\\s*\\d+(?:[.,]\\d+)?)+\\s*(?:${UNIDAD_TIEMPO})?`, 'g'),
  tiempoRango: new RegExp(`\\b(\\d+(?:\\s*(?:-|/|a)\\s*\\d+)+\\s*${UNIDAD_TIEMPO})`, 'g'),
  // «3-4 x 10-12», «3 a 4 séries de 12»: las series en rango. La base guarda
  // UN número de series, y no se inventa ni el 3 ni el 4: las repeticiones
  // se leen y lo demás queda entero en la nota.
  seriesRango: new RegExp(`\\b(\\d{1,2})\\s*(?:-|/|a)\\s*(\\d{1,2})\\s*(?:(?:series|serie|sets?|tandas)\\b\\s*(?:de|x|con|com|:|-)?|x|por\\b)\\s*(${REPS})?${SIN_PESO}${SUF_REPS}`, 'g'),
  sxr: new RegExp(`\\b(\\d{1,2})\\s*(?:x|por)\\s*(${REPS})${SIN_PESO}${SUF_REPS}`, 'g'),
  seriesDe: new RegExp(`\\b(\\d{1,2})\\s*(?:series|serie|sets?|tandas)\\b(?:\\s*(?:de|x|con|com|:|-)?\\s*(${REPS})${SIN_PESO}${SUF_REPS})?`, 'g'),
  nDeM: new RegExp(`\\b(\\d{1,2})\\s+de\\s+(${REPS})${SIN_PESO}${SUF_REPS}`, 'g'),
  seriesEtq: /\b(?:series|serie|sets?)\s*[:=]?\s*(\d{1,2})(?![\d.,x])/g,
  repsEtq: new RegExp(`\\b(?:reps?|repeticiones|repeticion|repeticoes|repeticao)\\s*[:=]?\\s*(${REPS})(?![\\d.,])`, 'g'),
  repsSufijo: new RegExp(`\\b(${REPS_NUM}(?:\\s*${LADO})?)\\s*(?:reps?|repeticiones|repeticion|repeticoes|repeticao)\\b\\.?`, 'g'),
  xReps: new RegExp(`(?:^|\\s)x\\s*(\\d{1,3}(?:\\s*(?:-|/)\\s*\\d{1,3})*(?:\\s*${UNIDAD_TIEMPO})?(?:\\s*${LADO})?)${SIN_PESO}`, 'g'),
  // «Flexiones al fallo», «Fondos hasta el fallo»: sin series, al final.
  repsPalabra: new RegExp(`\\s(${PALABRA_REPS})\\s*$`, 'g'),
  // «Press banca 12-10-8-6 40kg», «Remo 12/10/8»: una pirámide sin series.
  // Dos números o más, sin unidad después (eso sería un rango de carga o de tiempo).
  piramide: new RegExp(`\\b(\\d{1,3}(?:\\s*[-/]\\s*\\d{1,3})+)(?![\\d.,])(?!\\s*[-/]\\s*\\d)(?!\\s*(?:${UNIDAD_PESO}|placas?|minutos?|mins?|segundos?|segs?|s|%|'|")(?![a-z]))`, 'g'),
  cargaEtq: new RegExp(`\\b(?:carga|peso)\\s*[:=]\\s*(?:de\\s+)?(${NUMS})(?![\\d.,])(?!\\s*(?:${UNIDAD_PESO}|placas?)(?![a-z]))`, 'g'),
  peso: new RegExp(`(?:@\\s*)?\\b(${NUMS})\\s*(${UNIDAD_PESO})(?![a-z])(\\s*${LADO_CARGA})?`, 'g'),
  placa: /\bplacas?\s*(?:n[°º.]?\s*|#\s*|:\s*)?(\d{1,2})\b|\b(\d{1,2})\s*placas?\b/g,
  corporal: /\b(peso\s+corporal|peso\s+del\s+cuerpo|peso\s+do\s+corpo|autocarga|bodyweight|sin\s+peso|sem\s+peso|sin\s+carga|sem\s+carga)\b/g,
  banda: new RegExp(`\\b((?:banda|bandas|elastico|liga|faixa|mini\\s*band|superband|tubo)\\s+(?:${COLORES}))\\b`, 'g'),
  // El grupo 1 es el tiempo; lo de antes solo impide leer la mitad de «60-90s».
  tiempo: new RegExp(`(?:^|[^\\d\\-/.,:'])(${DUR})`, 'g'),
  distancia: /\b(\d+(?:[.,]\d+)?\s*(?:km|mts?|metros|m))(?![a-z\d])/g,
  suelto: new RegExp(`\\b(${NUMS})(?![\\d.,])(?!\\s*[a-z°º%'"])`, 'g'),
  general: /\bentre\s+(?:las\s+|los\s+|as\s+|os\s+|cada\s+)?(?:series|ejercicios|exercicios|bloques|rondas|vueltas|voltas|circuitos)\b/,
  etiquetaSuelta: /^(?:carga|peso|descanso|desc|pausa|intervalo|series|serie|sets?|reps?|repeticiones|repeticoes|kg|lb)\.?\s*[:=]?$/,
};

/** Lo que se sacó de un renglón. */
interface Campos {
  nombre: string;
  series: number | null;
  reps: string;
  carga: string;
  descanso_seg: number | null;
  /** Lo que sobró y no se entendió, en orden. Va a la nota. */
  sobras: string[];
  junto: boolean;
  /** Cuántos datos se reconocieron (series, repeticiones, carga, descanso). */
  datos: number;
  /** «Descanso 60 s entre series»: una indicación para todo el día, no para un ejercicio. */
  general: boolean;
  /** El renglón empezaba con los números y el nombre venía después («4x10 Press banca»). */
  nombreAlFinal: boolean;
}

function camposVacios(): Campos {
  return {
    nombre: '', series: null, reps: '', carga: '', descanso_seg: null,
    sobras: [], junto: false, datos: 0, general: false, nombreAlFinal: false,
  };
}

// Palabras que dicen qué es el número que las sigue (en el texto plegado).
const RE_ETIQUETA_NUMERO = /\b(?:rir|rpe|tempo|cadencia|ritmo|velocidad|velocidade|nivel|level|inclinacion|inclinacao)\s*[:=]?\s*$/;

// «Nota:», «Obs:» y compañía: todo lo que sigue es la nota, tal cual.
const RE_ETIQUETA_NOTA = /(^|[\s(\-–—·,;|])(notas?|obs\.?|observaci(?:on|ones|ao|oes)|importante|ojo|tip|aclaracion)\s*:\s*/;

/**
 * Lee un renglón libre: busca cada dato con su patrón, marca lo que ya se
 * usó, y lo que queda antes del primer dato es el nombre. Lo que queda
 * entre medio o al final es la nota.
 */
function leerCampos(texto: string): Campos {
  const c = camposVacios();
  let principal = texto;
  let notaEtiquetada = '';
  const et = RE_ETIQUETA_NOTA.exec(plegar(texto));
  if (et) {
    const desde = et.index + et[1].length;
    notaEtiquetada = texto.slice(desde + et[0].length - et[1].length).trim();
    principal = texto.slice(0, desde);
  }
  const f = plegar(principal);
  // Los pedazos ya leídos. Los marcados `nota` se entendieron como algo que
  // no es un dato («descanso 2»: ¿segundos o minutos?) y van enteros a la
  // nota, sin que otro patrón se lleve la mitad.
  const usados: { a: number; b: number; nota: boolean }[] = [];
  const libre = (a: number, b: number) => !usados.some((u) => a < u.b && b > u.a);
  // Lo encontrado se recorta del ORIGINAL (plegar no cambia los largos).
  const orig = (m: RegExpExecArray, k: number) => {
    const off = m[0].indexOf(m[k]);
    return principal.substr(m.index + Math.max(0, off), m[k].length);
  };
  /**
   * Recorre las coincidencias de un patrón. Si `alEncontrar` la rechaza, se
   * sigue buscando desde el carácter siguiente y no desde el final: en
   * «de 12 – 10 kg» un rechazo sobre «12» no puede saltearse el «10 kg».
   * Con `grupo`, el pedazo usado es solo ese grupo.
   */
  const buscar = (
    re: RegExp,
    alEncontrar: (m: RegExpExecArray, desde: number) => boolean | 'nota',
    grupo?: number,
  ) => {
    const tramo = (m: RegExpExecArray): [number, number] => {
      if (grupo !== undefined && m[grupo] !== undefined) {
        const a = m.index + Math.max(0, m[0].indexOf(m[grupo]));
        return [a, a + m[grupo].length];
      }
      return [m.index + (m[0].length - m[0].replace(/^\s+/, '').length), m.index + m[0].length];
    };
    re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(f))) {
      if (m[0].length === 0) { re.lastIndex++; continue; }
      let [a, b] = tramo(m);
      if (!libre(a, b)) {
        // La coincidencia larga pisa un pedazo ya leído: «3 x 10-30 seg de
        // descanso» toma «10-30 seg» como repeticiones y choca con el
        // descanso. Se prueba la misma expresión desde el mismo lugar pero
        // cortando el texto donde empieza lo leído, y se queda con «3 x 10».
        const corte = Math.min(...usados.filter((u) => u.b > m!.index && u.a < b).map((u) => u.a));
        const corto = corte > m.index ? new RegExp(re.source, re.flags.replace('g', '') + 'y') : null;
        const m2 = corto ? (corto.lastIndex = m.index, corto.exec(f.slice(0, corte))) : null;
        // Solo si termina donde termina una palabra: cortar «10-30» en «10-3» no vale.
        if (m2 && m2[0].length && !/^[\p{L}\d]/u.test(f.slice(m2.index + m2[0].length))) {
          m = m2;
          [a, b] = tramo(m);
        }
      }
      const r = libre(a, b) ? alEncontrar(m, a) : false;
      if (r) usados.push({ a, b, nota: r === 'nota' });
      else re.lastIndex = m.index + 1;
    }
  };
  const ponerReps = (r: string) => {
    const n = normalizarReps(r);
    if (n.length > LARGOS.reps) return false;
    c.reps = n;
    return true;
  };
  const ponerCarga = (s: string) => {
    if (c.carga) return false;
    const n = normalizarCarga(s);
    if (n.length > LARGOS.carga) return false;
    c.carga = n;
    return true;
  };
  const serieValida = (s: string) => { const n = +s; return n >= 1 && n <= 20; };
  /** El texto sin leer justo antes de `desde` (desde el último pedazo usado). */
  const antesDe = (desde: number) =>
    f.slice(Math.max(0, ...usados.filter((u) => u.b <= desde).map((u) => u.b)), desde);
  /** «tempo 3-1-1», «RIR 2»: el número es de esa palabra, no una repetición ni una carga. */
  const despuesDeEtiqueta = (desde: number) => RE_ETIQUETA_NUMERO.test(antesDe(desde));
  /** El pedazo empieza en la mitad de otro número («3-1-1» leído desde el segundo «1»). */
  const pegado = (desde: number) => /[\d.,:/-]/.test(f[desde - 1] ?? '');

  buscar(RE.junto, () => { c.junto = true; return true; });

  buscar(RE.descansoRango, () => 'nota');
  buscar(RE.descansoEtq, (m) => {
    if (c.descanso_seg !== null) return 'nota';
    const s = leerDescanso(orig(m, 1));
    if (s === null) return 'nota';
    // «pausa 2 seg arriba» es una pausa isométrica, parte de la técnica, no
    // el descanso entre series: nadie descansa 2 segundos. Queda entera en la nota.
    if (s < 10 && /^\s*pausa/.test(m[0])) return 'nota';
    c.descanso_seg = s;
    return true;
  });
  buscar(RE.descansoPost, (m) => {
    if (c.descanso_seg !== null) return false;
    const s = leerDescanso(orig(m, 1));
    if (s === null) return false;
    c.descanso_seg = s;
    return true;
  });

  // Series y repeticiones, de la forma más clara a la más suelta. Primero
  // las series en rango: si no, «3-4 x 10» daría 4 series y un «Sentadilla 3».
  buscar(RE.seriesRango, (m) => {
    if (c.series !== null || c.reps || !serieValida(m[1]) || !serieValida(m[2]) || +m[1] >= +m[2]) return false;
    if (m[3] !== undefined && !ponerReps(orig(m, 3))) return false;
    return 'nota';
  });
  buscar(RE.sxr, (m) => {
    if (c.series !== null || c.reps || !serieValida(m[1])) return false;
    if (!ponerReps(orig(m, 2))) return false;
    c.series = +m[1];
    return true;
  });
  buscar(RE.seriesDe, (m) => {
    if (c.series !== null || !serieValida(m[1])) return false;
    if (m[2] !== undefined) { if (c.reps || !ponerReps(orig(m, 2))) return false; }
    c.series = +m[1];
    return true;
  });
  buscar(RE.nDeM, (m) => {
    if (c.series !== null || c.reps || !serieValida(m[1])) return false;
    if (!ponerReps(orig(m, 2))) return false;
    c.series = +m[1];
    return true;
  });
  buscar(RE.seriesEtq, (m) => {
    if (c.series !== null || !serieValida(m[1])) return false;
    c.series = +m[1];
    return true;
  });
  buscar(RE.repsEtq, (m) => (!c.reps && ponerReps(orig(m, 1))));
  buscar(RE.repsSufijo, (m) => (!c.reps && ponerReps(orig(m, 1))));
  buscar(RE.xReps, (m) => (!c.reps && c.series === null && ponerReps(orig(m, 1))));

  // La carga: con su unidad, por placa, peso corporal o banda.
  buscar(RE.cargaEtq, (m) => ponerCarga(orig(m, 1)));
  buscar(RE.peso, (m) => {
    const nums = orig(m, 1).replace(/\s*([-/x])\s*/gi, '$1');
    const unidad = /^(?:lbs?|libras?)$/.test(m[2]) ? 'lb' : 'kg';
    const lado = m[3] ? ` ${orig(m, 3).trim().replace(/\bc\s*\/\s*/i, 'c/')}` : '';
    return ponerCarga(`${nums} ${unidad}${lado}`);
  });
  buscar(RE.placa, (m) => ponerCarga(`placa ${m[1] ?? m[2]}`));
  buscar(RE.corporal, (m) => ponerCarga(orig(m, 1)));
  buscar(RE.banda, (m) => ponerCarga(orig(m, 1)));

  // Repeticiones sin series que ningún patrón de arriba ve: la pirámide
  // («Press banca 12-10-8-6 40kg»: sin esto quedaba en el nombre y se creaba
  // el ejercicio «Press banca 12-10-8-6») y «al fallo» al final («Flexiones
  // al fallo»). Antes del tiempo: en «Remo 12/10/8 1:30» el 1:30 es el descanso.
  if (c.series === null && !c.reps) {
    buscar(RE.piramide, (m, desde) => !pegado(desde) && !despuesDeEtiqueta(desde) && ponerReps(orig(m, 1)));
  }
  if (!c.reps) buscar(RE.repsPalabra, (m) => ponerReps(orig(m, 1)), 1);

  // Un tiempo sin etiqueta: si todavía no hay repeticiones es lo que dura
  // el ejercicio («Plancha 45s», «Cinta 20 min»); si ya hay, es el descanso
  // («Remo 3x12 25 lb 1:30»).
  // Un rango de tiempo sin etiqueta: si faltan las repeticiones, son ellas
  // («Plancha 3 series 30-45 s»); si no, no es UN descanso y va a la nota.
  buscar(RE.tiempoRango, (m) => (!c.reps && ponerReps(orig(m, 1))) || 'nota');
  buscar(RE.tiempo, (m) => {
    const texto = orig(m, 1);
    if (!c.reps) return ponerReps(texto);
    if (c.descanso_seg !== null) return false;
    const s = leerDescanso(texto);
    // Menos de 10 segundos sin la palabra «descanso» no es un descanso: es
    // una pausa de la técnica («4x8 60kg 2 seg abajo»). Queda en la nota.
    if (s === null || s < 10) return false;
    c.descanso_seg = s;
    return true;
  }, 1);
  buscar(RE.distancia, (m) => (!c.reps && ponerReps(orig(m, 1).replace(/\s+/g, ' '))));

  // Un número solo, sin unidad, después de las series: es la carga, y queda
  // sin unidad («Press banca 4x10 40» → «40»). Antes del primer dato es
  // parte del nombre («Prensa 45 4x15»), y si lo sigue una palabra no es
  // una carga («con botellas de 1 litro»). Tampoco si lo precede una palabra
  // que dice qué es: «RIR 2», «RPE 8», «tempo 3-1-1», «velocidade 6» no son
  // cargas, y una carga inventada es lo peor que puede leer el cliente. Un
  // conector o la palabra misma sí la anuncian: «3x12 con 25», «carga 25».
  if (c.series !== null || c.reps) {
    const datos = usados.filter((u) => !u.nota);
    const inicioDatos = datos.length ? Math.min(...datos.map((u) => u.a)) : 0;
    buscar(RE.suelto, (m, desde) => {
      if (desde <= inicioDatos || pegado(desde)) return false;
      const palabra = /(\p{L}+)\s*[:=]?\s*$/u.exec(antesDe(desde));
      if (palabra && !RE_CONECTOR_SOLO.test(palabra[1]) && !/^(?:carga|peso)$/.test(palabra[1])) return false;
      return ponerCarga(orig(m, 1));
    });
  }

  c.general = c.descanso_seg !== null && RE.general.test(f);

  // Lo que quedó sin usar: el nombre y las sobras. Los pedazos marcados
  // `nota` también son sobras, enteros y en su lugar.
  usados.sort((x, y) => x.a - y.a);
  const trozos: { desde: number; texto: string; nota: boolean }[] = [];
  let pos = 0;
  for (const u of usados) {
    if (u.a > pos) trozos.push({ desde: pos, texto: principal.slice(pos, u.a), nota: false });
    if (u.nota) trozos.push({ desde: u.a, texto: principal.slice(u.a, u.b), nota: true });
    pos = Math.max(pos, u.b);
  }
  if (pos < principal.length) trozos.push({ desde: pos, texto: principal.slice(pos), nota: false });

  for (const t of trozos) {
    const esPrimero = t.desde === 0 && !t.nota;
    const limpio = t.nota ? t.texto.replace(/\s+/g, ' ').trim() : limpiarTrozo(t.texto, esPrimero);
    if (!limpio) continue;
    if (RE.etiquetaSuelta.test(plegar(limpio))) continue;
    if (esPrimero && tieneLetra(limpio)) c.nombre = limpio;
    else c.sobras.push(limpio);
  }
  // «4x10 Press banca 40kg»: el nombre vino después de los números.
  if (!c.nombre && usados.length && c.sobras.length && tieneLetra(c.sobras[0])) {
    c.nombre = c.sobras.shift() as string;
    c.nombreAlFinal = true;
  }
  if (notaEtiquetada) c.sobras.push(notaEtiquetada);
  c.datos = (c.series !== null ? 1 : 0) + (c.reps ? 1 : 0) + (c.carga ? 1 : 0) + (c.descanso_seg !== null ? 1 : 0);
  return c;
}

/**
 * El formato que exporta Orden: «Nombre — 4 × 10 · 40 kg · Descanso 1:30».
 * Cada pedazo entre « · » es un dato, así una carga escrita a mano («barra
 * sola», «nivel 5») vuelve entera, y unas repeticiones como «10 (lento)»
 * vuelven tal cual.
 */
function leerEstructurado(s: string): Campos | null {
  let nombre: string, resto: string;
  if (/\s—$/.test(s)) {
    nombre = s.slice(0, -2);
    resto = '';
  } else {
    const k = s.indexOf(' — ');
    if (k < 0) return null;
    nombre = s.slice(0, k);
    resto = s.slice(k + 3);
    // «Sentadilla — 4x12 — 40kg»: la raya separa todo, no es el formato de
    // Orden (que separa con « · »). Se lee libre.
    if (resto.includes(' — ')) return null;
  }
  const c = camposVacios();
  c.nombre = limpiarTrozo(nombre, true);
  if (!c.nombre || !tieneLetra(c.nombre)) return null;
  let primero = true;
  for (const crudo of resto.split(/\s+·\s+/)) {
    const seg = crudo.trim();
    if (!seg) continue;
    // «Carga: 40» (o «@ 40»): una carga sin series ni repeticiones. Sin la
    // etiqueta, «Sentadilla — 40» no se distingue de «Abdominales — 20».
    const etq = /^(?:(?:carga|peso)\s*:|@)\s*(\S.*)$/.exec(plegar(seg));
    if (etq && !c.carga) {
      const carga = normalizarCarga(seg.slice(seg.length - etq[1].length));
      if (carga.length <= LARGOS.carga) {
        c.carga = carga;
        primero = false;
        continue;
      }
    }
    const cs = leerCampos(seg);
    const soloSeriesYReps = cs.series !== null && !cs.carga && cs.descanso_seg === null && !cs.junto;
    const sobro = !!cs.nombre || cs.sobras.length > 0;
    if (soloSeriesYReps && sobro && c.series === null && !c.reps) {
      const m = /^(\d{1,2})\s*x\s*(.+)$/i.exec(seg);
      const reps = m ? normalizarReps(m[2]) : '';
      if (m && reps.length <= LARGOS.reps) {
        c.series = +m[1];
        c.reps = reps;
        primero = false;
        continue;
      }
    }
    if (!sobro && (cs.datos > 0 || cs.junto)) {
      const choca = (cs.series !== null && c.series !== null) || (!!cs.reps && !!c.reps)
        || (!!cs.carga && !!c.carga) || (cs.descanso_seg !== null && c.descanso_seg !== null);
      if (!choca) {
        if (cs.series !== null) c.series = cs.series;
        if (cs.reps) c.reps = cs.reps;
        if (cs.carga) c.carga = cs.carga;
        if (cs.descanso_seg !== null) c.descanso_seg = cs.descanso_seg;
        if (cs.junto) c.junto = true;
        if (cs.datos > 0) primero = false;
        continue;
      }
    }
    // El primer lugar, sin series: son las repeticiones, sean lo que sean
    // («Abdominales — 20», «Dominadas — al fallo», «Estocadas — 10 c/lado»,
    // «Burpees — AMRAP»), salvo que traigan una carga o un descanso que se
    // reconoce solo. Así las escribe `renglonDe`, que a una carga sin
    // repeticiones le pone la etiqueta. En cualquier otro lugar, la carga.
    if (primero && c.series === null && !c.reps && !cs.carga && cs.descanso_seg === null && !cs.junto) {
      const reps = normalizarReps(seg);
      if (reps.length <= LARGOS.reps) {
        c.reps = reps;
        primero = false;
        continue;
      }
    }
    const carga = normalizarCarga(seg);
    if (!c.carga && carga.length <= LARGOS.carga) {
      c.carga = carga;
      primero = false;
      continue;
    }
    c.sobras.push(seg);
    primero = false;
  }
  c.datos = (c.series !== null ? 1 : 0) + (c.reps ? 1 : 0) + (c.carga ? 1 : 0) + (c.descanso_seg !== null ? 1 : 0);
  return c;
}

/** Un renglón ya limpio, en el formato de Orden si lo es, o libre. */
function leerLinea(s: string): Campos {
  return leerEstructurado(s) ?? leerCampos(s);
}

function aEjercicio(c: Campos): EjercicioLeido {
  return {
    nombre: c.nombre,
    series: c.series,
    reps: c.reps,
    carga: c.carga,
    descanso_seg: c.descanso_seg,
    nota: c.sobras.join(' '),
    junto_al_anterior: c.junto,
  };
}

// Viñetas: «•», «-», «*», «✅» (ya sin el emoji), «>», «→»…
const RE_VINETA = /^(?:[-–—•◦▪▫■□●○►▸▶➤➔→⇒✓✔☑*+·>⁃‣]+\s*)+/;
// «1.», «1)», «1 -», «01.», «1º», «#1»; y «2a.», «2b)», «2b » para superseries.
const RE_NUMERO = /^(?:#\s*)?(\d{1,2})\s*(?:[.):º°]+|-(?!\d))\s*(?=[^\d\s]|$)/;
const RE_NUMERO_LETRA = /^(\d{1,2})([a-f])(?:\s*[.):\-–]+\s*|\s+)(?=[^\d\s])/i;
// «A1.», «B2)», «A1 -»: la otra forma de escribir superseries.
const RE_LETRA_NUMERO = /^([a-h])(\d)(?:\s*[.):\-–]+\s*|\s+)(?=\S)/i;
// «a)», «B)»: una lista con letras.
const RE_LISTA_LETRA = /^([a-z])\)\s+/i;

interface Prefijo { texto: string; vineta: boolean; numero: boolean; grupo: string | null }

function quitarVineta(s: string): { texto: string; hubo: boolean } {
  const m = RE_VINETA.exec(s);
  if (!m) return { texto: s, hubo: false };
  return { texto: s.slice(m[0].length).trim(), hubo: true };
}

function quitarNumero(s: string): Prefijo {
  let m = RE_NUMERO_LETRA.exec(s);
  if (m) return { texto: s.slice(m[0].length).trim(), vineta: false, numero: true, grupo: m[1] };
  m = RE_LETRA_NUMERO.exec(s);
  if (m) return { texto: s.slice(m[0].length).trim(), vineta: false, numero: true, grupo: m[1].toUpperCase() };
  m = RE_NUMERO.exec(s);
  if (m) return { texto: s.slice(m[0].length).trim(), vineta: false, numero: true, grupo: null };
  m = RE_LISTA_LETRA.exec(s);
  if (m) return { texto: s.slice(m[0].length).trim(), vineta: false, numero: true, grupo: null };
  return { texto: s, vineta: false, numero: false, grupo: null };
}

/**
 * El renglón rápido del editor: «Press banca 4x10 40kg 90s» → una tarjeta.
 * También entiende «Sentadilla 4 x 8-10 60 kg 2 min», «Plancha 3x45s»,
 * «Remo 3x12 25 lb 1:30» y «Flexiones 3 series de 15 peso corporal». Un
 * renglón con solo el nombre también sirve (después se completa en la
 * hoja). null si no hay un nombre de ejercicio posible.
 */
export function leerRenglon(linea: string): EjercicioLeido | null {
  let s = quitarFormato(limpiar(linea ?? ''));
  s = quitarVineta(s).texto;
  s = quitarNumero(s).texto;
  if (!s) return null;
  const c = leerLinea(s);
  if (!c.nombre || !tieneLetra(c.nombre) || c.nombre.length > LARGOS.ejercicio) return null;
  return aEjercicio(c);
}

// ─────────────────────────── leer una rutina entera ───────────────────────────

/** Lo que devuelve `leerRutina`: la forma del contrato más las notas generales de la rutina. */
export interface RutinaLeidaConNotas extends RutinaLeida {
  /** Las indicaciones generales (las de antes del primer día). Las ve el cliente. */
  notas: string;
}

type Renglon =
  | { tipo: 'nada' }
  | { tipo: 'vacio' }
  | { tipo: 'otro'; original: string }
  | {
      tipo: 'titulo'; texto: string; dia: boolean; original: string;
      /** Una negrita con datos: lo que sería si no fuera un título. */
      siNoTitulo?: Renglon;
    }
  | { tipo: 'seccion'; texto: string; conTexto: boolean; original: string }
  | { tipo: 'nota'; texto: string; sinEtiqueta: string; italica: boolean; original: string }
  | { tipo: 'superserie'; cuantos: number; original: string }
  | { tipo: 'datos'; campos: Campos; texto: string; original: string }
  | {
      tipo: 'ejercicios';
      lista: Campos[];
      grupo: string | null;
      /** Venía con viñeta o número: es un ejercicio aunque no tenga datos. */
      item: boolean;
      /** Es un nombre de la lista base («Sentadilla»). */
      conocido: boolean;
      /** «Superserie: Curl 3x12»: cuántos van juntos desde este (0: ninguno). */
      bloque?: number;
      dia?: string;
      original: string;
    };

// Días: «Día 1», «DÍA A», «Día A – Piernas», «Treino B», «Rutina A», «LUNES», «Segunda-feira».
const RE_DIA_NUMERO = /^(?:dia|day|treino|entrenamiento|entreno|rutina|sesion|sessao|workout|ficha)\s*\d{1,2}(?!\d)(?![.,]\d)/;
const RE_DIA_LETRA = /^(?:dia|day|treino|entrenamiento|entreno|rutina|sesion|sessao|workout|ficha)\s+([a-z])(?![a-z\d])/;
const RE_DIA_SEMANA = /^(?:lunes|martes|miercoles|jueves|viernes|sabado|domingo|segunda|terca|quarta|quinta|sexta)(?:\s*-\s*feira)?(?![a-z])/;
// «A - Pecho», «B) Espalda»: una letra mayúscula sola al principio.
const RE_DIA_LETRA_SOLA = /^([A-F])\s*[-–—:).]\s+\S/;
// Un día de descanso no es un día de la rutina: «Martes: descanso», «Domingo - libre».
// Se mira solo el final (se aplica a renglones que ya son días): el guion de
// «Terça-feira - folga» o «QUARTA-FEIRA: descanso» no puede cortarlo antes.
const RE_DIA_LIBRE = /[:\-–—]\s*(?:descanso(?:\s+total)?|libre|off|folga)\s*$/;

// Partes de un día que no son ejercicios: si traen texto van a las notas del día.
// También los verbos («Calentar 10 min en cinta», «Estirar 5 min»): sin
// ellos, «Calentar» entraba a la biblioteca como un ejercicio. Con \b, así
// «Estiramiento de isquiotibiales» (de la lista base) sigue siendo un ejercicio.
const RE_SECCION_SIEMPRE = /^(?:calentamiento|entrada\s+en\s+calor|entrar\s+en\s+calor|activacion|aquecimento|ativacao|vuelta\s+a\s+la\s+calma|volta\s+a\s+calma|enfriamiento|desaquecimento|calentar|calenta|estirar|estira|elongar|elonga|aquecer|aqueca|alongar|alonga|alongue)\b/;
// Estas solo con «:» o raya: «Movilidad» o «Estiramientos» sola puede ser
// el nombre de un día de verdad.
const RE_SECCION_CON_DOS_PUNTOS = /^(?:estiramientos?|elongacion(?:es)?|alongamentos?|movilidad|mobilidade|parte\s+principal|bloque\s+principal|parte\s+central|principal)\s*[:\-–—]/;

const RE_SUPERSERIE = /^(super\s*-?\s*serie|bi\s*-?\s*serie|bi\s*-?\s*set|tri\s*-?\s*serie|tri\s*-?\s*set|conjugado|biset|triset)s?\b\s*[:\-–—]?\s*/;
const RE_CIRCUITO = /^(?:circuito|circuit|hiit|tabata|emom|amrap)\b/;

// Lo que se escribe alrededor de una rutina y no es parte de ella.
const RE_CHARLA = /^(?:hola|holi|buen\s+dia|buenos\s+dias|buenas|oi|ola|bom\s+dia|boa\s+tarde|boa\s+noite|te\s+paso|te\s+mando|te\s+dejo|aca\s+(?:va|esta|tenes|te)|aqui\s+(?:va|esta|vai)|segue|saludos|abrazo|gracias|obrigad|cualquier\s+duda|qualquer\s+duvida|exitos|vamos|dale|bora|a\s+darle|bienvenid|bem-?vind|hacer|realizar|repetir|fazer|repita|haga|hace|descansar|tomar|recorda|lembre|no\s+olvides|intenta|trata|acordate)\b/;
const RE_SEMANA = /^semanas?\s+\d/;

/**
 * ¿Empieza como un día? 'palabra' si lo dice («Día 1», «Treino A»,
 * «LUNES»); 'letra' si es solo una letra al principio («A - Pecho»), que
 * es un día únicamente si el renglón no trae datos: «A) Sentadilla 4x12»
 * es una lista con letras.
 */
function esDia(texto: string): 'palabra' | 'letra' | null {
  const f = plegar(texto);
  if (RE_DIA_NUMERO.test(f) || RE_DIA_SEMANA.test(f)) return 'palabra';
  const m = RE_DIA_LETRA.exec(f);
  if (m) {
    // «Rutina A» sí; «Rutina a seguir» no: la letra suelta tiene que ser
    // mayúscula o estar sola, sin una palabra que la siga.
    const letra = texto[m.index + m[0].length - 1];
    const sigue = f.slice(m.index + m[0].length).trim();
    if (letra === letra.toUpperCase() || sigue === '' || /^[-–—:·.)|,]/.test(sigue)) return 'palabra';
  }
  // «D1 - Piernas», «D2: Pecho»: la D es de «día». Como «D1» también es la
  // etiqueta de una superserie, vale lo mismo que una letra sola (un día
  // solo si el renglón no trae datos), y no si lo que sigue es un ejercicio.
  const d = /^d\s*\d{1,2}\s*(?:[-–—:.)]\s*(\S.*))?$/.exec(f);
  if (d && !(d[1] && buscarBase(texto.slice(texto.length - d[1].length)))) return 'letra';
  return RE_DIA_LETRA_SOLA.test(texto) ? 'letra' : null;
}

function limpiarTitulo(s: string): string {
  return s.replace(/\s+/g, ' ').replace(/^[\s\-–—:|·,;.#]+/, '').replace(/[\s\-–—:|·,;.]+$/, '').trim();
}

/**
 * Un título cortado donde entra en la base (`tope` letras, contadas como
 * las cuenta PostgreSQL), en un espacio y no en medio de una palabra:
 * [lo que entra, lo que sobra]. Lo que sobra va a las notas.
 */
function partirTitulo(texto: string, tope: number): [string, string] {
  const letras = Array.from(texto.trim());
  if (letras.length <= tope) return [letras.join(''), ''];
  let corte = letras.lastIndexOf(' ', tope);
  let cabeza = corte > 0 ? letras.slice(0, corte).join('').replace(/[\s\-–—:|·,;.+&/]+$/, '').trim() : '';
  if (!cabeza) {
    corte = tope;
    cabeza = letras.slice(0, tope).join('').trim();
  }
  return [cabeza, letras.slice(corte).join('').trim()];
}

function esMayusculas(s: string): boolean {
  const letras = s.replace(/[^\p{L}]/gu, '');
  return letras.length >= 3 && letras === letras.toUpperCase() && letras !== letras.toLowerCase();
}

function palabras(s: string): number {
  return s.split(/\s+/).filter(Boolean).length;
}

function nota(texto: string, original: string, italica: boolean): Renglon {
  const et = /^(?:notas?|obs\.?|observaci(?:on|ones|ao|oes)|importante|ojo|tip|aclaracion)\s*:\s*/.exec(plegar(texto));
  return { tipo: 'nota', texto, sinEtiqueta: et ? texto.slice(et[0].length).trim() : texto, italica, original };
}

/** Los espacios raros como espacios, sin tocar nada más: los emojis quedan. */
function espacios(s: string): string {
  return s.replace(/[  -   　]/g, ' ').replace(/[ \t]+/g, ' ').trim();
}

// Un renglón entero en itálica o en negrita, como los escribe `rutinaComoTexto`.
const RE_ITALICA_ENTERA = /^_(.+)_$/s;
const RE_NEGRITA_ENTERA = /^\*([^*\s](?:[^*]*[^*\s])?)\*[:.]?$/;
// «Semana 1 - Día 1»: una semana que también dice qué día es.
const RE_PALABRA_DIA = /\b(?:dias?|day|treino|entrenamiento|entreno|sesion|sessao|workout|lunes|martes|miercoles|jueves|viernes|sabado|domingo|segunda|terca|quarta|quinta|sexta)\b/;
// «Buenos días» y «Bom dia» son ejercicios de la lista base, y también saludos.
const RE_EJERCICIO_SALUDO = /^(?:buenos\s+dias|bom\s+dia)\b/;
// Lo que queda de «x3 vueltas» o «Todo x3» al final de un circuito: no es un ejercicio.
const RE_VUELTAS = /^(?:vueltas?|rondas?|voltas?|veces|vezes|todo|todos|tudo)$/;

/**
 * El nombre de un ejercicio en el formato de Orden («1. Sentadilla 🔥 — 4 × 10»)
 * tal como se escribió, con sus emojis: sin ellos sería otro ejercicio de la
 * biblioteca. Solo si, limpio, es el mismo nombre que se leyó.
 */
function nombreTal(tal: string, nombre: string): string {
  const sinPrefijo = quitarNumero(quitarVineta(tal).texto).texto;
  const k = sinPrefijo.search(/\s—(?:\s|$)/);
  if (k <= 0) return nombre;
  // Un emoji al principio es una viñeta («✅ Press banca»), no parte del nombre.
  const crudo = sinPrefijo.slice(0, k).replace(/^[\p{Extended_Pictographic}️‍\s]+/u, '').trim();
  return crudo && limpiarTrozo(quitarFormato(limpiar(crudo)), true) === nombre ? crudo : nombre;
}

/** Un renglón de texto (no de planilla). */
function clasificarTexto(crudo: string, original: string): Renglon {
  let s = limpiar(crudo);
  if (!s) return { tipo: 'vacio' };
  let encabezado = false;
  s = s.replace(/^>\s*/, '');
  if (/^#{1,6}\s+/.test(s)) { encabezado = true; s = s.replace(/^#{1,6}\s+/, ''); }

  // El renglón tal cual, con sus emojis: una nota o un nombre se guardan
  // como se escribieron («Bajá lento 🐢», «Tomá agua 💧»). Los emojis se
  // sacan (en `s`) solo para reconocer los patrones.
  const tal = espacios(crudo).replace(/^>\s*/, '').replace(/^#{1,6}\s+/, '');

  // Itálica entera: una nota. Así exporta Orden las indicaciones.
  const it = RE_ITALICA_ENTERA.exec(tal) ?? RE_ITALICA_ENTERA.exec(s);
  if (it && it[1].trim()) return nota(it[1].trim(), original, true);

  // Negrita entera: un título. Así escribe `rutinaComoTexto` el nombre de la
  // rutina y el de cada día, y nunca un ejercicio. Se mira antes que todo lo
  // demás porque un nombre puede ser cualquier cosa: «Circuito», «HIIT»,
  // «Cardio 30 min», «Fuerza 5x5», «Activación y glúteos», «Libre» (un día
  // sin ejercicios). Salvo un día de descanso («*MARTES: descanso*»), un
  // saludo con signos («*Hola!*») o un ejercicio con sus datos que alguien
  // puso entero en negrita: numerado («*1. Remo 4x10*») o de la lista base
  // («*Sentadilla 4x10*»).
  const neg = RE_NEGRITA_ENTERA.exec(tal) ?? RE_NEGRITA_ENTERA.exec(s);
  if (neg) {
    const titulo = neg[1].replace(/\s+/g, ' ').trim();
    const dentro = quitarFormato(limpiar(neg[1]));
    const fd = plegar(dentro);
    const numerado = quitarNumero(dentro);
    const lectura = leerLinea(numerado.texto);
    const ejercicio = lectura.datos > 0 && (numerado.numero || (!!lectura.nombre && !!buscarBase(lectura.nombre)));
    if (dentro && Array.from(titulo).length <= LARGOS.nombreRutina && !ejercicio) {
      const diaDentro = esDia(dentro) === 'palabra';
      if (diaDentro && RE_DIA_LIBRE.test(fd)) return { tipo: 'otro', original };
      if (RE_CHARLA.test(fd) && /[!?¡¿]/.test(dentro)) return { tipo: 'otro', original };
      // Con datos («*Fuerza 5x5*») también podría ser un ejercicio que
      // alguien puso en negrita: lo decide `leerRutina` mirando si arranca
      // un bloque, como los títulos que escribe `rutinaComoTexto`.
      const siNoTitulo = lectura.datos > 0 && !diaDentro ? clasificarTexto(neg[1], original) : undefined;
      return { tipo: 'titulo', texto: titulo, dia: diaDentro, siNoTitulo, original };
    }
  }

  const negrita = (/^\*[^*\s]/.test(s) && /[^*\s]\*[:.]?$/.test(s)) || /^\*[^*\s]\*$/.test(s);
  s = quitarFormato(s);
  if (!s) return { tipo: 'vacio' };
  let f = plegar(s);

  if (RE_ETIQUETA_NOTA.exec(f)?.index === 0 && /^(?:notas?|obs|observaci|importante|ojo|tip|aclaracion)/.test(f)) {
    return nota(s, original, false);
  }

  const v = quitarVineta(s);
  s = v.texto;
  if (!s) return { tipo: 'vacio' };
  f = plegar(s);

  // Un saludo o una despedida no son parte de la rutina. «Buenos días 3x12
  // 30kg» sí: con datos es el ejercicio de la lista base.
  if (RE_CHARLA.test(f) && !(RE_EJERCICIO_SALUDO.test(f) && leerLinea(s).datos > 0)) return { tipo: 'otro', original };
  // «Semana 2: subir 2,5 kg» no se entiende; «Semana 1 - Día 2» es un día.
  if (RE_SEMANA.test(f)) {
    if (RE_PALABRA_DIA.test(f) && !leerLinea(s).datos) return { tipo: 'titulo', texto: limpiarTitulo(s), dia: true, original };
    return { tipo: 'otro', original };
  }
  if (RE_CIRCUITO.test(f)) return { tipo: 'otro', original };

  // «Superserie:» sola abre un bloque con los que siguen. Con los
  // ejercicios en el mismo renglón («Superserie: Curl 3x12 + Tríceps 3x12»)
  // el prefijo se saca: si no, el primero se llamaría «Superserie: Curl».
  let bloque = 0;
  const sup = RE_SUPERSERIE.exec(f);
  if (sup) {
    const resto = s.slice(sup[0].length).trim();
    const cuantos = /^tri/.test(sup[1]) ? 3 : 2;
    if (!resto || !leerLinea(resto).datos) return { tipo: 'superserie', cuantos, original };
    s = resto;
    f = plegar(s);
    bloque = cuantos;
  }

  if (RE_SECCION_SIEMPRE.test(f) || RE_SECCION_CON_DOS_PUNTOS.test(f)) {
    const conTexto = /[:\-–—]\s*\S/.test(s) || !RE_SECCION_CON_DOS_PUNTOS.test(f) && palabras(s) > 1;
    return { tipo: 'seccion', texto: limpiarTitulo(s), conTexto, original };
  }

  const dia = esDia(s);
  if (dia === 'palabra' || (dia === 'letra' && !leerLinea(s).datos)) {
    if (RE_DIA_LIBRE.test(f)) return { tipo: 'otro', original };
    return { tipo: 'titulo', texto: limpiarTitulo(s), dia: true, original };
  }

  // Un renglón en negrita que no entró arriba (demasiado largo para ser un
  // nombre de Orden) y sin datos: también es un título.
  if (negrita && !leerLinea(s).datos) {
    if (/^(?:descanso|libre|off|folga)$/.test(plegar(limpiarTitulo(s)))) return { tipo: 'otro', original };
    return { tipo: 'titulo', texto: limpiarTitulo(s), dia: false, original };
  }

  const n = quitarNumero(s);
  s = n.texto;
  if (!s) return { tipo: 'vacio' };
  const item = v.hubo || n.numero;

  // «Press banca 4x10 + Remo 4x10»: dos ejercicios juntos, en superserie.
  if (/\s\+\s/.test(s)) {
    const partes = s.split(/\s+\+\s+/).map(leerLinea);
    if (partes.length > 1 && partes.every((p) => p.nombre && p.datos > 0)) {
      partes.slice(1).forEach((p) => { p.junto = true; });
      return { tipo: 'ejercicios', lista: partes, grupo: n.grupo, item, conocido: false, bloque, original };
    }
  }

  const c = leerLinea(s);
  if (c.datos > 0 || c.junto) {
    if (!c.nombre || c.general) return { tipo: 'datos', campos: c, texto: s, original };
    if (c.nombre.length > LARGOS.ejercicio || RE_VUELTAS.test(plegar(c.nombre))) return { tipo: 'otro', original };
    c.nombre = nombreTal(tal, c.nombre);
    return { tipo: 'ejercicios', lista: [c], grupo: n.grupo, item, conocido: !!buscarBase(c.nombre), bloque, original };
  }

  // Sin datos: un título, un ejercicio con solo el nombre, o algo que no se entiende.
  const conocido = !!buscarBase(c.nombre || s);
  if (!item && !conocido) {
    const corto = palabras(s) <= 6 && s.length <= LARGOS.nombreDia + 10 && !/[!?¡¿]/.test(s);
    if (corto && (encabezado || /:$/.test(s) || esMayusculas(s))) {
      if (/^(?:descanso|libre|off|folga)$/.test(plegar(limpiarTitulo(s)))) return { tipo: 'otro', original };
      return { tipo: 'titulo', texto: limpiarTitulo(s), dia: false, original };
    }
  }
  if (!c.nombre || c.nombre.length > LARGOS.ejercicio) return { tipo: 'otro', original };
  if (!item && !conocido && (palabras(c.nombre) > 6 || /[.!?¡¿]$/.test(c.nombre))) return { tipo: 'otro', original };
  if (c.sobras.length && !item) return { tipo: 'otro', original };
  c.nombre = nombreTal(tal, c.nombre);
  return { tipo: 'ejercicios', lista: [c], grupo: n.grupo, item, conocido, original };
}

// ── Planillas pegadas de Excel o de Google Sheets (columnas con tabulador) ──

type Columna = 'ejercicio' | 'series' | 'reps' | 'carga' | 'descanso' | 'nota' | 'dia' | 'ignorar' | 'otra';
interface EstadoTabla { columnas: { tipo: Columna; titulo: string; unidad: 's' | 'min' | null }[] | null }

function columnaDe(celda: string): Columna {
  const f = plegar(celda).replace(/[^a-z0-9#°º%()/ ]/g, '').trim();
  if (/^(?:ejercicios?|exercicios?|nombre|nome|movimientos?|movimentos?|exercises?)\b/.test(f)) return 'ejercicio';
  if (/^(?:series|serie|sets?|tandas)\b/.test(f)) return 'series';
  if (/^(?:reps?|repeticiones|repeticion|repeticoes|repeticao)\b/.test(f)) return 'reps';
  if (/^(?:peso|pesos|carga|cargas|kg|kilos?|lbs?|libras?)\b/.test(f)) return 'carga';
  if (/^(?:descanso|desc|pausa|intervalo|rest|recuperacion|recuperacao)\b/.test(f)) return 'descanso';
  if (/^(?:notas?|obs|observaciones|observacion|observacoes|observacao|comentarios?|indicaciones|tecnica|detalles?)\b/.test(f)) return 'nota';
  if (/^(?:dias?|treinos?|sesion|sessao|day)\b/.test(f)) return 'dia';
  if (/^(?:#|n°|nº|n|nro|numero|orden|ordem)$/.test(f)) return 'ignorar';
  return 'otra';
}

/** Las celdas de un renglón de planilla, o null si no lo es. */
function celdasDe(linea: string): string[] | null {
  if (linea.includes('\t')) return linea.split('\t');
  const pipas = (linea.match(/\|/g) ?? []).length;
  if (pipas >= 2) {
    const celdas = linea.split('|');
    if (!celdas[0].trim()) celdas.shift();
    if (celdas.length && !celdas[celdas.length - 1].trim()) celdas.pop();
    return celdas;
  }
  return null;
}

function limpiarCelda(c: string): string {
  const s = quitarFormato(limpiar(c ?? ''));
  return /^[-–—_.]+$/.test(s) ? '' : s;
}

function filaDeTabla(celdas: string[], tabla: EstadoTabla, original: string): Renglon {
  const valores = celdas.map(limpiarCelda);
  const e = camposVacios();
  let dia: string | undefined;

  // La celda del nombre puede traer también los datos («Sentadilla 4x12»):
  // salen de ahí, y el nombre queda limpio. Si no, se creaba el ejercicio
  // «Sentadilla 4x12» en la biblioteca.
  const ponerNombre = (v: string) => {
    const celda = limpiarTrozo(quitarNumero(quitarVineta(v).texto).texto, true);
    const c = leerCampos(celda);
    if (!c.nombre || c.nombreAlFinal || c.datos === 0) { e.nombre = celda; return; }
    e.nombre = c.nombre;
    if (c.series !== null && e.series === null) e.series = c.series;
    if (c.reps && !e.reps) e.reps = c.reps;
    if (c.carga && !e.carga) e.carga = c.carga;
    if (c.descanso_seg !== null && e.descanso_seg === null) e.descanso_seg = c.descanso_seg;
    e.sobras.push(...c.sobras);
  };

  if (tabla.columnas) {
    tabla.columnas.forEach((col, k) => {
      const v = valores[k] ?? '';
      if (!v) return;
      switch (col.tipo) {
        case 'ejercicio': ponerNombre(v); break;
        case 'series': {
          if (/^\d{1,2}$/.test(v) && +v >= 1 && +v <= 20) { e.series = +v; break; }
          const c = leerCampos(v);
          if (c.series !== null && !c.nombre && !c.sobras.length) {
            e.series = c.series;
            if (c.reps && !e.reps) e.reps = c.reps;
          } else e.sobras.push(`${col.titulo}: ${v}`);
          break;
        }
        case 'reps': {
          // «4x12» en la columna de repeticiones trae también las series.
          const sr = /^(\d{1,2})\s*[x×]\s*(.+)$/i.exec(v);
          if (sr && e.series === null && +sr[1] >= 1 && +sr[1] <= 20) {
            const r = normalizarReps(sr[2]);
            if (r.length <= LARGOS.reps) { e.series = +sr[1]; e.reps = r; break; }
          }
          const r = normalizarReps(v);
          if (r.length <= LARGOS.reps) e.reps = r; else e.sobras.push(`${col.titulo}: ${v}`);
          break;
        }
        case 'carga': {
          const cg = normalizarCarga(v);
          if (cg.length <= LARGOS.carga) e.carga = cg; else e.sobras.push(`${col.titulo}: ${v}`);
          break;
        }
        case 'descanso': {
          const s = leerDescanso(v, col.unidad);
          if (s !== null) e.descanso_seg = s; else e.sobras.push(`${col.titulo}: ${v}`);
          break;
        }
        case 'nota': e.sobras.push(v); break;
        case 'dia': dia = limpiarTitulo(v); break;
        case 'ignorar': break;
        default: e.sobras.push(`${col.titulo}: ${v}`);
      }
    });
    valores.slice(tabla.columnas.length).filter(Boolean).forEach((v) => e.sobras.push(v));
  } else {
    // Sin encabezado: el nombre es la primera celda con letras y los
    // números siguen el orden de siempre (series, repeticiones, carga).
    let k = 0;
    while (k < valores.length && (!valores[k] || !tieneLetra(valores[k]))) k++;
    if (k >= valores.length) return { tipo: 'otro', original };
    // Un día por columna («DIA 1 <TAB> DIA 2», y abajo un ejercicio de cada
    // día por fila) no se sabe leer: la fila entera va a lo no entendido, en
    // vez de inventar el ejercicio «DIA 1» o esconder el segundo día en notas.
    if (valores.filter(Boolean).every((x) => esDia(x))) return { tipo: 'otro', original };
    ponerNombre(valores[k]);
    for (const v of valores.slice(k + 1)) {
      if (!v) continue;
      const c = leerCampos(v);
      if (c.nombre && !c.nombreAlFinal && c.series !== null) return { tipo: 'otro', original };
      const choca = (c.series !== null && e.series !== null) || (!!c.reps && !!e.reps)
        || (!!c.carga && !!e.carga) || (c.descanso_seg !== null && e.descanso_seg !== null);
      if (c.datos > 0 && !c.nombre && !c.sobras.length && !choca) {
        if (c.series !== null) e.series = c.series;
        if (c.reps) e.reps = c.reps;
        if (c.carga) e.carga = c.carga;
        if (c.descanso_seg !== null) e.descanso_seg = c.descanso_seg;
      } else if (/^\d{1,2}$/.test(v) && e.series === null && !e.reps && +v >= 1 && +v <= 20) {
        e.series = +v;
      } else if (/^\d{1,3}(?:\s*(?:-|\/|a)\s*\d{1,3})*$/.test(v) && !e.reps) {
        e.reps = normalizarReps(v);
      } else if (/^\d+(?:[.,]\d+)?$/.test(v) && !e.carga) {
        e.carga = v;
      } else {
        e.sobras.push(v);
      }
    }
  }

  if (!e.nombre || !tieneLetra(e.nombre) || e.nombre.length > LARGOS.ejercicio) return { tipo: 'otro', original };
  e.datos = (e.series !== null ? 1 : 0) + (e.reps ? 1 : 0) + (e.carga ? 1 : 0) + (e.descanso_seg !== null ? 1 : 0);
  return { tipo: 'ejercicios', lista: [e], grupo: null, item: true, conocido: !!buscarBase(e.nombre), dia, original };
}

function clasificar(linea: string, tabla: EstadoTabla): Renglon {
  const original = linea.trim();
  if (!original) return { tipo: 'vacio' };
  const celdas = celdasDe(linea);
  if (celdas) {
    // La fila de guiones de una tabla en markdown.
    if (celdas.every((c) => /^\s*:?-{2,}:?\s*$/.test(c) || !c.trim())) return { tipo: 'nada' };
    const tipos = celdas.map((c) => columnaDe(limpiarCelda(c)));
    if (tipos.includes('ejercicio') && tipos.some((t) => t === 'series' || t === 'reps' || t === 'carga' || t === 'descanso')) {
      tabla.columnas = celdas.map((c, k) => {
        const titulo = limpiarCelda(c);
        const f = plegar(titulo);
        const unidad = /\bmin/.test(f) ? 'min' : /\bseg|\(s\)|\bs\b/.test(f) ? 's' : null;
        return { tipo: tipos[k], titulo, unidad };
      });
      return { tipo: 'nada' };
    }
    const llenas = celdas.map(limpiarCelda).filter(Boolean);
    if (llenas.length >= 2) return filaDeTabla(celdas, tabla, original);
    if (llenas.length === 0) return { tipo: 'vacio' };
    return clasificarTexto(llenas[0], original);
  }
  return clasificarTexto(linea, original);
}

interface DiaArmado { nombre: string; notas: string[]; ejercicios: EjercicioLeido[] }

/**
 * «Pegar texto»: una rutina entera escrita a mano, copiada de WhatsApp, de
 * Notas o de una planilla. Devuelve los días con sus ejercicios, el nombre
 * de la rutina si lo tenía, y los renglones que no se entendieron (se
 * muestran tal cual; nada se inventa).
 *
 * - Un día empieza con un título: «DÍA 1», «Día A – Piernas», «LUNES»,
 *   «Treino A – Peito», un renglón entero en *negrita*, en MAYÚSCULAS o que
 *   termina en «:». El primer título, si lo sigue otro título, es el nombre
 *   de la rutina.
 * - Si los ejercicios arrancan sin ningún título, van a un día con el nombre
 *   vacío: la pantalla le pone uno.
 * - Las superseries se reconocen por «2a / 2b», «A1 / A2», «Superserie:»
 *   seguido de los ejercicios, «X + Y» en un renglón o «junto con el
 *   anterior».
 * - «Calentamiento: …» y las líneas en _itálica_ antes del primer ejercicio
 *   son las notas del día; debajo de un ejercicio, «Obs: …», «Nota: …» o
 *   una itálica son su nota. Antes del primer día, las notas de la rutina.
 * - Un renglón con solo el nombre y abajo «4 x 12» es un ejercicio en dos
 *   renglones; «Descanso 60 s» abajo de un ejercicio completa su descanso.
 * - Una planilla con encabezado (Ejercicio / Series / Reps / Peso /
 *   Descanso, también en portugués, y una columna Día si la tiene) se lee
 *   por columnas.
 */
export function leerRutina(texto: string): RutinaLeidaConNotas {
  const lineas = (texto ?? '').replace(/\r\n?/g, '\n').split('\n');
  const tabla: EstadoTabla = { columnas: null };
  const R = lineas.map((l) => clasificar(l, tabla));
  // Una negrita entera con datos es un título si arranca un bloque (el
  // primer renglón, o después de uno vacío), que es como escribe
  // `rutinaComoTexto` el nombre de la rutina y cada día («*Fuerza 5x5*»).
  // Pegada a otros renglones es un ejercicio que alguien puso en negrita.
  let hayAntes = false;
  for (let i = 0; i < R.length; i++) {
    const r = R[i];
    if (r.tipo === 'titulo' && r.siNoTitulo && hayAntes && R[i - 1].tipo !== 'vacio') R[i] = r.siNoTitulo;
    if (r.tipo !== 'vacio' && r.tipo !== 'nada') hayAntes = true;
  }

  let nombre: string | null = null;
  const notasRutina: string[] = [];
  const dias: DiaArmado[] = [];
  const noEntendidas: string[] = [];
  let dia: DiaArmado | null = null;
  let ultimo: { ej: EjercicioLeido; grupo: string | null } | null = null;
  let bloque: { quedan: number; primero: boolean } | null = null;
  let huboEjercicio = false;

  // Un título más largo que lo que entra en la base se corta en un espacio,
  // y lo que sobra va a las notas: no puede desaparecer en silencio.
  const nuevoDia = (n: string) => {
    const [cabeza, sobra] = partirTitulo(n, LARGOS.nombreDia);
    dia = { nombre: cabeza, notas: sobra ? [sobra] : [], ejercicios: [] };
    dias.push(dia);
    ultimo = null;
    bloque = null;
  };
  const nombrarRutina = (n: string) => {
    const [cabeza, sobra] = partirTitulo(n, LARGOS.nombreRutina);
    nombre = cabeza;
    if (sobra) notasRutina.push(sobra);
  };
  const notaDeContexto = (t: string) => {
    if (dia) (dia as DiaArmado).notas.push(t);
    else notasRutina.push(t);
  };
  const saltable = (r: Renglon) => r.tipo === 'vacio' || r.tipo === 'nada' || r.tipo === 'nota'
    || r.tipo === 'otro' || r.tipo === 'superserie' || (r.tipo === 'seccion' && r.conTexto);
  const siguiente = (i: number): Renglon | undefined => {
    for (let j = i + 1; j < R.length; j++) if (!saltable(R[j])) return R[j];
    return undefined;
  };
  const siguienteNoVacio = (i: number): number => {
    for (let j = i + 1; j < R.length; j++) if (R[j].tipo !== 'vacio' && R[j].tipo !== 'nada') return j;
    return -1;
  };
  const agregar = (c: Campos, grupo: string | null, forzarJunto = false) => {
    if (!dia) {
      dia = { nombre: '', notas: [], ejercicios: [] };
      dias.push(dia);
    }
    const d = dia as DiaArmado;
    const ej = aEjercicio(c);
    let junto = ej.junto_al_anterior || forzarJunto;
    const u = ultimo as { ej: EjercicioLeido; grupo: string | null } | null;
    if (grupo && u && u.grupo === grupo) junto = true;
    const b = bloque as { quedan: number; primero: boolean } | null;
    if (b) {
      if (!b.primero) junto = true;
      b.primero = false;
      b.quedan--;
      if (b.quedan <= 0) bloque = null;
    }
    if (d.ejercicios.length === 0) junto = false;
    ej.junto_al_anterior = junto;
    d.ejercicios.push(ej);
    ultimo = { ej, grupo };
    huboEjercicio = true;
  };
  /** ¿Se pueden sumar estos datos al ejercicio sin pisar nada? */
  const encaja = (ej: EjercicioLeido, c: Campos) =>
    !(c.series !== null && ej.series !== null) && !(c.reps && ej.reps)
    && !(c.carga && ej.carga) && !(c.descanso_seg !== null && ej.descanso_seg !== null);
  const completar = (ej: EjercicioLeido, c: Campos, notaExtra?: string) => {
    if (c.series !== null) ej.series = c.series;
    if (c.reps) ej.reps = c.reps;
    if (c.carga) ej.carga = c.carga;
    if (c.descanso_seg !== null) ej.descanso_seg = c.descanso_seg;
    if (c.junto) ej.junto_al_anterior = true;
    const extra = [notaExtra, ...c.sobras].filter(Boolean).join(' ');
    if (extra) ej.nota = ej.nota ? `${ej.nota} ${extra}` : extra;
  };

  for (let i = 0; i < R.length; i++) {
    const r = R[i];
    switch (r.tipo) {
      case 'nada':
        break;
      case 'vacio':
        bloque = null;
        break;
      case 'otro':
        noEntendidas.push(r.original);
        break;
      case 'superserie':
        bloque = { quedan: r.cuantos, primero: true };
        break;
      case 'titulo': {
        if (nombre === null && dias.length === 0 && !huboEjercicio) {
          // El primer título: si lo sigue otro título, es el nombre de la
          // rutina («*Fuerza base*» y abajo «*Día A*»). Si lo siguen
          // ejercicios, es un día cuando dice serlo o cuando hay más
          // títulos después; si es el único, es el nombre de la rutina.
          const sig = siguiente(i);
          if (sig && sig.tipo === 'titulo') {
            nombrarRutina(r.texto);
            break;
          }
          const otroTitulo = R.slice(i + 1).some((x) => x.tipo === 'titulo');
          if (r.dia || otroTitulo) nuevoDia(r.texto);
          else nombrarRutina(r.texto);
          break;
        }
        nuevoDia(r.texto);
        break;
      }
      case 'seccion':
        bloque = null;
        if (r.conTexto) notaDeContexto(r.texto);
        else noEntendidas.push(r.original);
        break;
      case 'nota': {
        const u = ultimo as { ej: EjercicioLeido } | null;
        if (u && dia) {
          const t = r.sinEtiqueta;
          if (t) u.ej.nota = u.ej.nota ? `${u.ej.nota}\n${t}` : t;
        } else {
          notaDeContexto(r.texto);
        }
        break;
      }
      case 'datos': {
        const c = r.campos;
        const u = ultimo as { ej: EjercicioLeido } | null;
        if (c.general) notaDeContexto(r.texto);
        else if (u && encaja(u.ej, c)) completar(u.ej, c, c.nombre);
        else if (!u && c.datos === 1 && c.descanso_seg !== null) notaDeContexto(r.texto);
        else noEntendidas.push(r.original);
        break;
      }
      case 'ejercicios': {
        if (r.dia !== undefined && r.dia && (!dia || (dia as DiaArmado).nombre !== partirTitulo(r.dia, LARGOS.nombreDia)[0])) {
          nuevoDia(r.dia);
        }
        if (r.bloque) bloque = { quedan: r.bloque, primero: true };
        const [primero, ...resto] = r.lista;
        if (primero.datos === 0 && !primero.junto && resto.length === 0) {
          // Solo el nombre: ¿vienen los datos en el renglón de abajo?
          const j = siguienteNoVacio(i);
          const sig = j >= 0 ? R[j] : undefined;
          if (sig && sig.tipo === 'datos' && !sig.campos.general) {
            const c = sig.campos;
            const unido = { ...primero, series: c.series, reps: c.reps, carga: c.carga, descanso_seg: c.descanso_seg,
              sobras: [...primero.sobras, ...(c.nombre ? [c.nombre] : []), ...c.sobras], junto: primero.junto || c.junto };
            agregar(unido, r.grupo);
            R[j] = { tipo: 'nada' };
            break;
          }
          if (sig && sig.tipo === 'ejercicios' && sig.lista.length === 1 && sig.lista[0].nombreAlFinal && !sig.conocido) {
            const c = sig.lista[0];
            const unido = { ...primero, series: c.series, reps: c.reps, carga: c.carga, descanso_seg: c.descanso_seg,
              sobras: [...primero.sobras, c.nombre, ...c.sobras], junto: primero.junto || c.junto };
            agregar(unido, r.grupo);
            R[j] = { tipo: 'nada' };
            break;
          }
          if (r.item || r.conocido) agregar(primero, r.grupo);
          else noEntendidas.push(r.original);
          break;
        }
        agregar(primero, r.grupo);
        resto.forEach((c) => agregar(c, null, true));
        break;
      }
    }
  }

  return {
    nombre,
    notas: notasRutina.join('\n'),
    dias: dias.map((d) => ({ nombre: d.nombre, notas: d.notas.join('\n'), ejercicios: d.ejercicios })),
    noEntendidas,
  };
}

// ─────────────────────────── la rutina como texto ───────────────────────────

/**
 * Lo que necesita `rutinaComoTexto`. Entra una `RutinaCompleta` (el editor,
 * la carpeta del cliente), la `rutina` de `RutinaPublica` (el link, donde la
 * superserie se llama `junto`) o una `RutinaLeida`.
 */
export interface RutinaParaTexto {
  nombre?: string | null;
  notas?: string | null;
  dias: {
    orden?: number;
    nombre: string;
    notas?: string | null;
    ejercicios: {
      orden?: number;
      nombre: string;
      series: number | null;
      reps: string;
      carga: string;
      descanso_seg: number | null;
      nota?: string | null;
      junto_al_anterior?: boolean;
      junto?: boolean;
    }[];
  }[];
}

/**
 * Las etiquetas de `rutinaComoTexto`: las de `TextosRutinaTexto` más
 * «Carga», para la carga de un ejercicio sin series ni repeticiones. Va
 * opcional mientras `TextosRutinaTexto` (tipos-rutinas.ts) no la tenga:
 * sin ella se escribe «@ 40», que el lector también entiende.
 */
export type TextosComoTexto = TextosRutinaTexto & { carga?: string };

function ordenados<T extends { orden?: number }>(lista: readonly T[]): T[] {
  return [...lista].sort((a, b) => (a.orden ?? 0) - (b.orden ?? 0));
}

function lineasDe(texto: string | null | undefined): string[] {
  return (texto ?? '').split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
}

/**
 * La rutina para mandar por WhatsApp o copiar, con el formato de WhatsApp:
 *
 *   *Fuerza base*
 *   _Entrá en calor 10 minutos._
 *
 *   *Día A · Piernas*
 *   1. Sentadilla con barra — 4 × 8-10 · 40 kg · Descanso 1:30
 *      _Nota: bajá hasta la paralela._
 *   2a. Press banca — 4 × 10 · 40 kg
 *   2b. Remo con mancuerna — 4 × 12 · 20 lb · Junto con el anterior
 *
 * Las palabras («series», «Descanso», «Nota», «Junto con el anterior»,
 * «Carga») llegan en `t`, del diccionario. La carga va tal cual está
 * guardada: sin unidad si no la tenía, y con su etiqueta solo si el
 * ejercicio no tiene series ni repeticiones («Sentadilla — Carga: 40»).
 * Nunca incluye «Salud y lesiones»: no está en la rutina.
 */
export function rutinaComoTexto(rutina: RutinaParaTexto, t: TextosComoTexto): string {
  const out: string[] = [];
  const nombre = (rutina.nombre ?? '').trim();
  if (nombre) out.push(`*${nombre}*`);
  for (const l of lineasDe(rutina.notas)) out.push(`_${l}_`);

  for (const dia of ordenados(rutina.dias)) {
    if (out.length) out.push('');
    const nd = (dia.nombre ?? '').trim();
    if (nd) out.push(`*${nd}*`);
    for (const l of lineasDe(dia.notas)) out.push(`_${l}_`);

    const ejs = ordenados(dia.ejercicios);
    const juntos = ejs.map((e, i) => i > 0 && !!(e.junto_al_anterior ?? e.junto));
    // Cuántos ejercicios tiene cada grupo, para saber si va «2» o «2a, 2b».
    const grupos: number[] = [];
    let g = 0;
    for (let i = 0; i < ejs.length; i++) {
      if (!juntos[i]) g++;
      grupos.push(g);
    }
    const tamano = (n: number) => grupos.filter((x) => x === n).length;
    let letra = 0;
    ejs.forEach((e, i) => {
      letra = juntos[i] ? letra + 1 : 0;
      const etiqueta = tamano(grupos[i]) > 1 ? `${grupos[i]}${String.fromCharCode(97 + Math.min(letra, 25))}` : `${grupos[i]}`;
      out.push(`${etiqueta}. ${renglonDe(e, juntos[i], t)}`);
      lineasDe(e.nota).forEach((l, k) => out.push(k === 0 ? `   _${t.nota}: ${l}_` : `   _${l}_`));
    });
  }
  return out.join('\n');
}

function renglonDe(e: RutinaParaTexto['dias'][number]['ejercicios'][number], junto: boolean, t: TextosComoTexto): string {
  const partes: string[] = [];
  const reps = (e.reps ?? '').trim();
  const conSeries = e.series !== null && e.series !== undefined;
  if (conSeries && reps) partes.push(`${e.series} × ${reps}`);
  else if (conSeries) partes.push(`${e.series} ${t.series}`);
  else if (reps) partes.push(reps);
  const carga = (e.carga ?? '').trim();
  // Sin series ni repeticiones, el primer dato se lee como repeticiones: la
  // carga va con su etiqueta («Sentadilla — Carga: 40»), o «40» volvería
  // como 40 repeticiones.
  if (carga && !conSeries && !reps) partes.push(t.carga ? `${t.carga}: ${carga}` : `@ ${carga}`);
  else if (carga) partes.push(carga);
  if (e.descanso_seg !== null && e.descanso_seg !== undefined) partes.push(`${t.descanso} ${formatoDescanso(e.descanso_seg)}`);
  if (junto) partes.push(t.superserie);
  const nombre = (e.nombre ?? '').trim();
  if (partes.length) return `${nombre} — ${partes.join(' · ')}`;
  // Un nombre que, leído solo, parecería traer datos («Cinta 20 min») se
  // marca con la raya al final para que vuelva como nombre.
  const leido = leerLinea(quitarFormato(limpiar(nombre)));
  const seLeeIgual = leido.nombre === nombre && leido.datos === 0 && !leido.junto && leido.sobras.length === 0;
  return seLeeIgual ? nombre : `${nombre} —`;
}
