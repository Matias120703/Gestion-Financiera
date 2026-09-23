/**
 * LA LISTA BASE DE EJERCICIOS (098): para sugerir, nunca para guardar.
 *
 * La biblioteca de cada negocio (`ejercicios`) arranca vacía y se arma sola:
 * un ejercicio entra la primera vez que se usa en una rutina. Esta lista
 * solo alimenta el autocompletar del editor, para que el trainer escriba
 * «sent» y le aparezca «Sentadilla con barra» sin haberla cargado nunca.
 *
 * Son unos cien de los que se usan de verdad en un gimnasio de la región,
 * con peso corporal, bandas, cardio y movilidad, cada uno con su nombre en
 * español y en portugués de Brasil (el que dice un trainer de allá, no una
 * traducción: «Stiff», «Remada serrote», «Tríceps testa») y su grupo, que
 * es el check de `ejercicios.grupo`.
 *
 * `claveEjercicio` repite en el navegador la función `clave_ejercicio` de la
 * base: minúsculas, sin tildes y con los espacios colapsados. Con ella
 * «Sentadilla  búlgara» y «sentadilla bulgara» son el mismo ejercicio acá y
 * allá, y la sugerencia no ofrece uno que el negocio ya tiene.
 *
 * Este archivo NO importa nada del servidor ni de React: se compila suelto
 * para las pruebas (ver "probar:calculos" en package.json).
 */
import type { GrupoEjercicio } from './tipos-rutinas';

export interface EjercicioBase {
  es: string;
  pt: string;
  grupo: GrupoEjercicio;
}

/** Los grupos, en el orden en que se ofrecen. Los nombres visibles están en el diccionario. */
export const GRUPOS_EJERCICIO: GrupoEjercicio[] = [
  'piernas', 'gluteos', 'pecho', 'espalda', 'hombros', 'brazos', 'core', 'cardio', 'movilidad', 'otro',
];

// Dentro de cada grupo, los más comunes primero: a igual coincidencia, la
// sugerencia respeta este orden.
export const EJERCICIOS_BASE: EjercicioBase[] = [
  // Piernas
  { es: 'Sentadilla con barra', pt: 'Agachamento livre com barra', grupo: 'piernas' },
  { es: 'Sentadilla', pt: 'Agachamento', grupo: 'piernas' },
  { es: 'Sentadilla goblet', pt: 'Agachamento goblet', grupo: 'piernas' },
  { es: 'Sentadilla búlgara', pt: 'Agachamento búlgaro', grupo: 'piernas' },
  { es: 'Sentadilla sumo', pt: 'Agachamento sumô', grupo: 'piernas' },
  { es: 'Sentadilla frontal', pt: 'Agachamento frontal', grupo: 'piernas' },
  { es: 'Sentadilla en Smith', pt: 'Agachamento no Smith', grupo: 'piernas' },
  { es: 'Sentadilla hack', pt: 'Agachamento hack', grupo: 'piernas' },
  { es: 'Sentadilla con salto', pt: 'Agachamento com salto', grupo: 'piernas' },
  { es: 'Sentadilla isométrica en la pared', pt: 'Agachamento isométrico na parede', grupo: 'piernas' },
  { es: 'Sentadilla con banda', pt: 'Agachamento com elástico', grupo: 'piernas' },
  { es: 'Prensa 45°', pt: 'Leg press 45°', grupo: 'piernas' },
  { es: 'Prensa horizontal', pt: 'Leg press horizontal', grupo: 'piernas' },
  { es: 'Estocadas', pt: 'Afundo', grupo: 'piernas' },
  { es: 'Estocadas caminando', pt: 'Passada', grupo: 'piernas' },
  { es: 'Estocada hacia atrás', pt: 'Afundo reverso', grupo: 'piernas' },
  { es: 'Subida al cajón', pt: 'Subida no banco', grupo: 'piernas' },
  { es: 'Sillón de cuádriceps', pt: 'Cadeira extensora', grupo: 'piernas' },
  { es: 'Camilla de isquiotibiales', pt: 'Mesa flexora', grupo: 'piernas' },
  { es: 'Curl femoral sentado', pt: 'Cadeira flexora', grupo: 'piernas' },
  { es: 'Peso muerto', pt: 'Levantamento terra', grupo: 'piernas' },
  { es: 'Peso muerto rumano', pt: 'Stiff', grupo: 'piernas' },
  { es: 'Peso muerto sumo', pt: 'Levantamento terra sumô', grupo: 'piernas' },
  { es: 'Buenos días', pt: 'Bom dia', grupo: 'piernas' },
  { es: 'Gemelos de pie', pt: 'Panturrilha em pé', grupo: 'piernas' },
  { es: 'Gemelos sentado', pt: 'Panturrilha sentado', grupo: 'piernas' },
  { es: 'Aductores en máquina', pt: 'Cadeira adutora', grupo: 'piernas' },
  { es: 'Saltos al cajón', pt: 'Salto na caixa', grupo: 'piernas' },

  // Glúteos
  { es: 'Hip thrust', pt: 'Elevação pélvica', grupo: 'gluteos' },
  { es: 'Puente de glúteos', pt: 'Ponte de glúteos', grupo: 'gluteos' },
  { es: 'Patada de glúteo', pt: 'Glúteo coice', grupo: 'gluteos' },
  { es: 'Patada de glúteo en polea', pt: 'Glúteo na polia', grupo: 'gluteos' },
  { es: 'Abductores en máquina', pt: 'Cadeira abdutora', grupo: 'gluteos' },
  { es: 'Abducción de cadera con banda', pt: 'Abdução de quadril com elástico', grupo: 'gluteos' },
  { es: 'Caminata lateral con banda', pt: 'Caminhada lateral com elástico', grupo: 'gluteos' },
  { es: 'Peso muerto a una pierna', pt: 'Stiff unilateral', grupo: 'gluteos' },
  { es: 'Kettlebell swing', pt: 'Swing com kettlebell', grupo: 'gluteos' },

  // Pecho
  { es: 'Press banca plano', pt: 'Supino reto', grupo: 'pecho' },
  { es: 'Press banca inclinado', pt: 'Supino inclinado', grupo: 'pecho' },
  { es: 'Press banca declinado', pt: 'Supino declinado', grupo: 'pecho' },
  { es: 'Press con mancuernas', pt: 'Supino com halteres', grupo: 'pecho' },
  { es: 'Press inclinado con mancuernas', pt: 'Supino inclinado com halteres', grupo: 'pecho' },
  { es: 'Press de pecho en máquina', pt: 'Supino máquina', grupo: 'pecho' },
  { es: 'Aperturas con mancuernas', pt: 'Crucifixo com halteres', grupo: 'pecho' },
  { es: 'Mariposa (peck deck)', pt: 'Voador (peck deck)', grupo: 'pecho' },
  { es: 'Cruce de poleas', pt: 'Crossover', grupo: 'pecho' },
  { es: 'Flexiones de brazos', pt: 'Flexão de braço', grupo: 'pecho' },
  { es: 'Flexiones con rodillas apoyadas', pt: 'Flexão com joelhos apoiados', grupo: 'pecho' },
  { es: 'Fondos en paralelas', pt: 'Mergulho nas paralelas', grupo: 'pecho' },
  { es: 'Pullover con mancuerna', pt: 'Pullover com halter', grupo: 'pecho' },
  { es: 'Press de pecho con banda', pt: 'Supino com elástico', grupo: 'pecho' },

  // Espalda
  { es: 'Jalón al pecho', pt: 'Puxada frontal', grupo: 'espalda' },
  { es: 'Jalón con agarre cerrado', pt: 'Puxada com triângulo', grupo: 'espalda' },
  { es: 'Dominadas', pt: 'Barra fixa', grupo: 'espalda' },
  { es: 'Dominadas asistidas', pt: 'Barra fixa assistida', grupo: 'espalda' },
  { es: 'Remo con barra', pt: 'Remada curvada', grupo: 'espalda' },
  { es: 'Remo con mancuerna', pt: 'Remada serrote', grupo: 'espalda' },
  { es: 'Remo en polea baja', pt: 'Remada baixa', grupo: 'espalda' },
  { es: 'Remo en máquina', pt: 'Remada articulada', grupo: 'espalda' },
  { es: 'Remo invertido', pt: 'Remada invertida', grupo: 'espalda' },
  { es: 'Remo con banda', pt: 'Remada com elástico', grupo: 'espalda' },
  { es: 'Pullover en polea', pt: 'Pulldown na polia', grupo: 'espalda' },
  { es: 'Hiperextensiones', pt: 'Extensão lombar', grupo: 'espalda' },

  // Hombros
  { es: 'Press militar', pt: 'Desenvolvimento militar', grupo: 'hombros' },
  { es: 'Press de hombros con mancuernas', pt: 'Desenvolvimento com halteres', grupo: 'hombros' },
  { es: 'Press Arnold', pt: 'Desenvolvimento Arnold', grupo: 'hombros' },
  { es: 'Elevaciones laterales', pt: 'Elevação lateral', grupo: 'hombros' },
  { es: 'Elevaciones frontales', pt: 'Elevação frontal', grupo: 'hombros' },
  { es: 'Aperturas invertidas', pt: 'Crucifixo inverso', grupo: 'hombros' },
  { es: 'Face pull', pt: 'Face pull', grupo: 'hombros' },
  { es: 'Remo al mentón', pt: 'Remada alta', grupo: 'hombros' },
  { es: 'Encogimientos de hombros', pt: 'Encolhimento de ombros', grupo: 'hombros' },
  { es: 'Separación de banda (pull apart)', pt: 'Pull apart com elástico', grupo: 'hombros' },

  // Brazos
  { es: 'Curl de bíceps con barra', pt: 'Rosca direta', grupo: 'brazos' },
  { es: 'Curl de bíceps con mancuernas', pt: 'Rosca alternada', grupo: 'brazos' },
  { es: 'Curl martillo', pt: 'Rosca martelo', grupo: 'brazos' },
  { es: 'Curl concentrado', pt: 'Rosca concentrada', grupo: 'brazos' },
  { es: 'Curl en banco Scott', pt: 'Rosca Scott', grupo: 'brazos' },
  { es: 'Curl en polea', pt: 'Rosca na polia', grupo: 'brazos' },
  { es: 'Curl de bíceps con banda', pt: 'Rosca com elástico', grupo: 'brazos' },
  { es: 'Tríceps en polea', pt: 'Tríceps pulley', grupo: 'brazos' },
  { es: 'Tríceps con soga', pt: 'Tríceps corda', grupo: 'brazos' },
  { es: 'Press francés', pt: 'Tríceps testa', grupo: 'brazos' },
  { es: 'Extensión de tríceps por encima de la cabeza', pt: 'Tríceps francês', grupo: 'brazos' },
  { es: 'Patada de tríceps', pt: 'Tríceps coice', grupo: 'brazos' },
  { es: 'Fondos en banco', pt: 'Mergulho no banco', grupo: 'brazos' },
  { es: 'Curl de muñeca', pt: 'Rosca de punho', grupo: 'brazos' },

  // Core
  { es: 'Plancha', pt: 'Prancha', grupo: 'core' },
  { es: 'Plancha lateral', pt: 'Prancha lateral', grupo: 'core' },
  { es: 'Abdominales', pt: 'Abdominal supra', grupo: 'core' },
  { es: 'Elevación de piernas', pt: 'Elevação de pernas', grupo: 'core' },
  { es: 'Abdominales bicicleta', pt: 'Abdominal bicicleta', grupo: 'core' },
  { es: 'Giro ruso', pt: 'Giro russo', grupo: 'core' },
  { es: 'Rueda abdominal', pt: 'Roda abdominal', grupo: 'core' },
  { es: 'Escaladores', pt: 'Escalador', grupo: 'core' },
  { es: 'Dead bug', pt: 'Dead bug', grupo: 'core' },
  { es: 'Bird dog', pt: 'Perdigueiro', grupo: 'core' },
  { es: 'Pallof press', pt: 'Pallof press', grupo: 'core' },

  // Cardio
  { es: 'Caminata en cinta', pt: 'Caminhada na esteira', grupo: 'cardio' },
  { es: 'Correr en cinta', pt: 'Corrida na esteira', grupo: 'cardio' },
  { es: 'Bicicleta fija', pt: 'Bicicleta ergométrica', grupo: 'cardio' },
  { es: 'Elíptico', pt: 'Elíptico', grupo: 'cardio' },
  { es: 'Remo ergómetro', pt: 'Remo ergômetro', grupo: 'cardio' },
  { es: 'Saltar la cuerda', pt: 'Pular corda', grupo: 'cardio' },
  { es: 'Burpees', pt: 'Burpee', grupo: 'cardio' },
  { es: 'Saltos de tijera', pt: 'Polichinelo', grupo: 'cardio' },
  { es: 'Skipping', pt: 'Skipping', grupo: 'cardio' },
  { es: 'Soga de batalla', pt: 'Corda naval', grupo: 'cardio' },

  // Movilidad
  { es: 'Movilidad de cadera', pt: 'Mobilidade de quadril', grupo: 'movilidad' },
  { es: 'Movilidad de hombros', pt: 'Mobilidade de ombros', grupo: 'movilidad' },
  { es: 'Movilidad de tobillo', pt: 'Mobilidade de tornozelo', grupo: 'movilidad' },
  { es: 'Gato-camello', pt: 'Gato-camelo', grupo: 'movilidad' },
  { es: 'Rotaciones torácicas', pt: 'Rotação torácica', grupo: 'movilidad' },
  { es: 'Estiramiento de isquiotibiales', pt: 'Alongamento de posteriores', grupo: 'movilidad' },
  { es: 'Estiramiento de cuádriceps', pt: 'Alongamento de quadríceps', grupo: 'movilidad' },
  { es: 'Estiramiento de pectorales', pt: 'Alongamento de peitoral', grupo: 'movilidad' },
  { es: 'Postura del niño', pt: 'Postura da criança', grupo: 'movilidad' },
  { es: 'Rodillo de espuma', pt: 'Liberação miofascial com rolo', grupo: 'movilidad' },

  // Otro
  { es: 'Paseo del granjero', pt: 'Caminhada do fazendeiro', grupo: 'otro' },
  { es: 'Levantada turca', pt: 'Levantamento turco', grupo: 'otro' },
  { es: 'Thruster', pt: 'Thruster', grupo: 'otro' },
];

const SIN_TILDE: Record<string, string> = {
  á: 'a', à: 'a', â: 'a', ã: 'a', ä: 'a',
  é: 'e', è: 'e', ê: 'e', ë: 'e',
  í: 'i', ì: 'i', î: 'i', ï: 'i',
  ó: 'o', ò: 'o', ô: 'o', õ: 'o', ö: 'o',
  ú: 'u', ù: 'u', û: 'u', ü: 'u',
  ñ: 'n', ç: 'c',
};

/**
 * La misma clave que `public.clave_ejercicio` en la 098: sin espacios de
 * más, en minúsculas y con las mismas letras cambiadas por el `translate`
 * (áàâãä → a, …, ñ → n, ç → c). Dos nombres con la misma clave son el mismo
 * ejercicio para la base, así que también lo son para la sugerencia.
 */
export function claveEjercicio(nombre: string | null | undefined): string {
  const s = (nombre ?? '').trim().replace(/\s+/g, ' ').toLowerCase();
  let r = '';
  for (let i = 0; i < s.length; i++) r += SIN_TILDE[s[i]] ?? s[i];
  return r;
}

// Las claves de la lista, calculadas una sola vez.
const CLAVES = EJERCICIOS_BASE.map((e) => ({ e, es: claveEjercicio(e.es), pt: claveEjercicio(e.pt) }));

/** Sin la «s» del plural: «Estocada» y «Estocadas» se reconocen igual. */
function singular(clave: string): string {
  return clave.replace(/s$/, '');
}

/**
 * El ejercicio de la lista que se llama así (en cualquiera de los dos
 * idiomas), o undefined. Sirve para proponer el grupo de uno nuevo, y para
 * que al pegar un texto un renglón que dice solo «Sentadilla» se reconozca
 * como ejercicio y no como un título.
 */
export function buscarBase(nombre: string): EjercicioBase | undefined {
  const k = claveEjercicio(nombre);
  if (!k) return undefined;
  const ks = singular(k);
  const hallado = CLAVES.find((c) => c.es === k || c.pt === k)
    ?? CLAVES.find((c) => singular(c.es) === ks || singular(c.pt) === ks);
  return hallado?.e;
}

export interface Sugerencia {
  nombre: string;
  /** Es de la biblioteca del negocio (y no de la lista base). */
  propio: boolean;
  /** El grupo, si sale de la lista base. Los propios lo traen de la biblioteca. */
  grupo: GrupoEjercicio | null;
}

/**
 * Qué tan bien coincide un nombre con lo escrito. Menor es mejor; null es
 * que no coincide. Todo sin tildes y sin mayúsculas.
 *   0 · es exactamente eso
 *   1 · el nombre empieza con lo escrito («sent» → «Sentadilla…»)
 *   2 · cada palabra escrita es el comienzo de alguna palabra del nombre
 *       («press inc» → «Press banca inclinado»)
 *   3 · lo escrito aparece en algún lugar del nombre
 */
function puntaje(clave: string, busqueda: string, palabras: string[]): number | null {
  if (clave === busqueda) return 0;
  if (clave.startsWith(busqueda)) return 1;
  const suyas = clave.split(/[\s\-()/,.]+/).filter(Boolean);
  if (palabras.every((p) => suyas.some((s) => s.startsWith(p)))) return 2;
  if (clave.includes(busqueda)) return 3;
  return null;
}

/**
 * Las sugerencias para el autocompletar del editor: primero los ejercicios
 * del negocio (`propios`, en el orden en que vienen: `ejercicios_de` ya los
 * trae con los más usados arriba) y después la lista base en el idioma de
 * la pantalla. Dentro de cada grupo, por qué tan bien coinciden.
 *
 * Un ejercicio de la lista base que el negocio ya tiene (misma clave) no se
 * ofrece dos veces. Con el texto vacío devuelve los primeros de cada lista.
 */
export function sugerir(
  texto: string,
  idioma: 'es' | 'pt',
  propios: readonly string[] = [],
  limite = 8,
): Sugerencia[] {
  const busqueda = claveEjercicio(texto);
  const palabras = busqueda.split(/[\s\-()/,.]+/).filter(Boolean);
  const vistas = new Set<string>();
  const candidatos: { s: Sugerencia; puntos: number; orden: number }[] = [];

  propios.forEach((nombre, i) => {
    const k = claveEjercicio(nombre);
    if (!k || vistas.has(k)) return;
    vistas.add(k);
    const p = busqueda ? puntaje(k, busqueda, palabras) : 4;
    if (p === null) return;
    candidatos.push({ s: { nombre: nombre.trim().replace(/\s+/g, ' '), propio: true, grupo: null }, puntos: p, orden: i });
  });

  CLAVES.forEach((c, i) => {
    const k = idioma === 'pt' ? c.pt : c.es;
    if (vistas.has(k)) return;
    vistas.add(k);
    const p = busqueda ? puntaje(k, busqueda, palabras) : 4;
    if (p === null) return;
    candidatos.push({ s: { nombre: idioma === 'pt' ? c.e.pt : c.e.es, propio: false, grupo: c.e.grupo }, puntos: p, orden: i });
  });

  candidatos.sort((a, b) =>
    (a.s.propio === b.s.propio ? 0 : a.s.propio ? -1 : 1)
    || a.puntos - b.puntos
    || a.orden - b.orden);
  return candidatos.slice(0, Math.max(0, limite)).map((c) => c.s);
}
