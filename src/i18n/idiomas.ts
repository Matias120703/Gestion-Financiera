/**
 * Idiomas que entiende Orden: español y portugués, los dos completos.
 *
 * POR QUÉ DOS Y NO SEIS
 *
 * Hubo portugués, alemán, francés e italiano. Estaban al 47% cada uno, y lo
 * que faltaba caía a inglés — así que quien elegía portugués veía una mezcla
 * de portugués e inglés y concluía, con razón, que el producto estaba a
 * medio hacer.
 *
 * Un idioma a medias es peor que no ofrecerlo: uno promete algo que no
 * cumple, el otro no promete nada. Y mantener seis significa traducir cada
 * texto nuevo seis veces, para siempre, sin un solo cliente que los use.
 *
 * La regla ahora: **un idioma se agrega cuando hay alguien que lo necesita,
 * y se agrega completo.** Crear el archivo en textos/, sumarlo a IDIOMAS y a
 * DICCIONARIOS. Ninguna pantalla se toca.
 */

/**
 * PORTUGUÉS SÍ, INGLÉS NO (2026-09-16)
 *
 * El portugués volvió porque hay a quién: los brasileños que trabajan en
 * Paraguay, muchos de ellos agrónomos. El inglés salió de la lista por la
 * razón inversa: nadie lo usa, y tenerlo acá obligaba a escribir cada texto
 * nuevo tres veces. Sus textos siguen en `textos/en.ts`, apoyados en español
 * para lo que les falta, por si algún día hay a quién ofrecérselo.
 */
export const IDIOMAS = ['es', 'pt'] as const;
export type Idioma = (typeof IDIOMAS)[number];

/**
 * MIENTRAS ESTO TENGA UN IDIOMA, ORDEN HABLA SOLO ESE.
 *
 * No se borró el inglés: los textos siguen enteros en `textos/en.ts` y el
 * mecanismo intacto. Lo que pasaba es que la traducción NO estaba completa
 * —quedaban pantallas a medio traducir— y media app en español y media en
 * inglés se ve peor que una app en un solo idioma.
 *
 * Para volver a tener dos: poner `null` acá. Vuelve el selector en Ajustes,
 * vuelve la detección por navegador y vuelve la cookie. Un renglón.
 *
 * Antes de hacerlo, terminar la traducción: es lo que faltaba.
 *
 * 2026-09-17: en `null` a pedido de Matías, con el portugués terminado salvo
 * privacidad y términos, que siguen en español.
 */
export const IDIOMA_UNICO: Idioma | null = null;

export const IDIOMA_POR_DEFECTO: Idioma = 'es';
/** Al que caen las traducciones incompletas. */
export const IDIOMA_DE_RESPALDO: Idioma = 'es';

export interface FichaIdioma {
  /** Cómo lo llaman quienes lo hablan. Nunca "Spanish" en la lista de idiomas. */
  nombre: string;
  /** Locale para Intl: manda el separador de miles, el decimal y los meses. */
  locale: string;
  bandera: string;
}

export const FICHA: Record<Idioma, FichaIdioma> = {
  es: { nombre: 'Español', locale: 'es-PY', bandera: '🇵🇾' },
  pt: { nombre: 'Português', locale: 'pt-BR', bandera: '🇧🇷' },
};

export const COOKIE_IDIOMA = 'orden_idioma';

export function esIdioma(v: unknown): v is Idioma {
  return typeof v === 'string' && (IDIOMAS as readonly string[]).includes(v);
}

/**
 * Saca el idioma de un Accept-Language. Solo mira la parte principal:
 * `pt-BR` y `pt-PT` son los dos `pt` para nosotros — un diccionario por
 * variante regional sería multiplicar el trabajo por muy poca ganancia.
 */
export function idiomaDeCabecera(cabecera: string | null | undefined): Idioma | null {
  if (!cabecera) return null;
  const preferidos = cabecera
    .split(',')
    .map((parte) => {
      const [etiqueta, q] = parte.trim().split(';q=');
      return { base: etiqueta.trim().toLowerCase().split('-')[0], peso: q ? Number(q) : 1 };
    })
    .filter((x) => Number.isFinite(x.peso))
    .sort((a, b) => b.peso - a.peso);

  for (const { base } of preferidos) {
    if (esIdioma(base)) return base;
  }
  return null;
}

/**
 * Moneda que le proponemos a quien crea su negocio, según el idioma.
 * Es solo una sugerencia para el formulario: la moneda real la elige la
 * persona y queda guardada en la empresa.
 */
export const MONEDA_SUGERIDA: Record<Idioma, string> = {
  // Portugués sugiere guaraníes y no reales: quien lo elige es, por ahora,
  // un brasileño que trabaja en Paraguay y factura acá.
  es: 'PYG', pt: 'PYG',
};
