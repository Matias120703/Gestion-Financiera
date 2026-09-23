/**
 * TEXTOS DE RUTINAS (098): lo que comparten varias pantallas de rutinas: unidades, nombres de medidas, grupos de ejercicio y las etiquetas del texto para WhatsApp.
 *
 * Van en su propio archivo para que cada pantalla del módulo del trainer
 * tenga el suyo, en español y en portugués a la vez. El diccionario los
 * incluye como `t.rutinasComun` (ver es.ts y pt.ts). El portugués se escribe con
 * el tipo del español: si falta una clave, no compila.
 *
 * Las claves de `medidas`, `metodosGrasa`, `grupos`, `unidadesCarga` y
 * `categoriasImc` son las mismas que usan la base y las librerías
 * (src/lib/medidas.ts, ejercicios-base.ts, rutina-texto.ts): la pantalla
 * busca el nombre con la clave que le llega, y el `satisfies` de cada una
 * hace que falte o sobre una y no compile.
 *
 * La unidad de cada medida va aparte del nombre para que la pantalla la
 * ponga donde corresponde: «Cintura» arriba del campo y «cm» adentro, o
 * «−4,5 cm» en la tarjeta del progreso.
 */
import type { ClaveMedida, GrupoEjercicio, MetodoGrasa } from '../../lib/tipos-rutinas';
import type { CategoriaImc } from '../../lib/medidas';
import type { TextosComoTexto, UnidadCarga } from '../../lib/rutina-texto';

type NombreYUnidad = { nombre: string; unidad: string };

export const rutinasComunEs = {
  medidas: {
    peso_kg: { nombre: 'Peso', unidad: 'kg' },
    altura_cm: { nombre: 'Altura', unidad: 'cm' },
    cintura_cm: { nombre: 'Cintura', unidad: 'cm' },
    cadera_cm: { nombre: 'Cadera', unidad: 'cm' },
    pecho_cm: { nombre: 'Pecho', unidad: 'cm' },
    brazo_cm: { nombre: 'Brazo contraído', unidad: 'cm' },
    muslo_cm: { nombre: 'Muslo', unidad: 'cm' },
    grasa_pct: { nombre: '% de grasa', unidad: '%' },
    pantorrilla_cm: { nombre: 'Pantorrilla', unidad: 'cm' },
    cuello_cm: { nombre: 'Cuello', unidad: 'cm' },
  } satisfies Record<ClaveMedida, NombreYUnidad>,
  /** Con qué se midió el % de grasa. Dos métodos distintos no se comparan. */
  metodosGrasa: {
    balanza: 'Balanza',
    plicometro: 'Plicómetro',
    cinta: 'Cinta métrica',
    otro: 'Otro',
  } satisfies Record<MetodoGrasa, string>,
  /** Lo que devuelve `categoriaImc` (medidas.ts). Categorías de la OMS para adultos. */
  imc: 'IMC',
  categoriasImc: {
    bajo: 'Bajo peso',
    normal: 'Normal',
    sobrepeso: 'Sobrepeso',
    obesidad: 'Obesidad',
  } satisfies Record<CategoriaImc, string>,
  cinturaAltura: 'Cintura / altura',
  grupos: {
    piernas: 'Piernas',
    gluteos: 'Glúteos',
    pecho: 'Pecho',
    espalda: 'Espalda',
    hombros: 'Hombros',
    brazos: 'Brazos',
    core: 'Abdomen y core',
    cardio: 'Cardio',
    movilidad: 'Movilidad',
    otro: 'Otro',
  } satisfies Record<GrupoEjercicio, string>,
  /**
   * Los botones de unidad de la carga. Escriben la unidad en el texto
   * (`conUnidad` de rutina-texto.ts): nunca se agrega sola.
   */
  unidadesCarga: {
    kg: 'kg',
    lb: 'lb',
    placa: 'Placa',
    corporal: 'Peso corporal',
  } satisfies Record<UnidadCarga, string>,
  /** Las palabras de `rutinaComoTexto` (lo que se manda por WhatsApp). */
  texto: {
    series: 'series',
    descanso: 'Descanso',
    nota: 'Nota',
    superserie: 'Junto con el anterior',
    /** La carga de un ejercicio sin series ni repeticiones: «Sentadilla — Carga: 40». */
    carga: 'Carga',
  } satisfies Required<TextosComoTexto>,
  acciones: {
    mandarWhatsapp: 'Mandar por WhatsApp',
    copiarTexto: 'Copiar como texto',
    copiado: 'Copiado',
    verComoSeHace: 'Ver cómo se hace',
  },
};

export const rutinasComunPt: typeof rutinasComunEs = {
  medidas: {
    peso_kg: { nombre: 'Peso', unidad: 'kg' },
    altura_cm: { nombre: 'Altura', unidad: 'cm' },
    cintura_cm: { nombre: 'Cintura', unidad: 'cm' },
    cadera_cm: { nombre: 'Quadril', unidad: 'cm' },
    pecho_cm: { nombre: 'Tórax', unidad: 'cm' },
    brazo_cm: { nombre: 'Braço contraído', unidad: 'cm' },
    muslo_cm: { nombre: 'Coxa', unidad: 'cm' },
    grasa_pct: { nombre: '% de gordura', unidad: '%' },
    pantorrilla_cm: { nombre: 'Panturrilha', unidad: 'cm' },
    cuello_cm: { nombre: 'Pescoço', unidad: 'cm' },
  },
  metodosGrasa: {
    balanza: 'Balança',
    plicometro: 'Adipômetro',
    cinta: 'Fita métrica',
    otro: 'Outro',
  },
  imc: 'IMC',
  categoriasImc: {
    bajo: 'Abaixo do peso',
    normal: 'Normal',
    sobrepeso: 'Sobrepeso',
    obesidad: 'Obesidade',
  },
  cinturaAltura: 'Cintura / altura',
  grupos: {
    piernas: 'Pernas',
    gluteos: 'Glúteos',
    pecho: 'Peito',
    espalda: 'Costas',
    hombros: 'Ombros',
    brazos: 'Braços',
    core: 'Abdômen e core',
    cardio: 'Cardio',
    movilidad: 'Mobilidade',
    otro: 'Outro',
  },
  unidadesCarga: {
    kg: 'kg',
    lb: 'lb',
    placa: 'Placa',
    corporal: 'Peso corporal',
  },
  texto: {
    series: 'séries',
    descanso: 'Descanso',
    nota: 'Obs.',
    superserie: 'Junto com o anterior',
    carga: 'Carga',
  },
  acciones: {
    mandarWhatsapp: 'Enviar pelo WhatsApp',
    copiarTexto: 'Copiar como texto',
    copiado: 'Copiado',
    verComoSeHace: 'Ver como se faz',
  },
};
