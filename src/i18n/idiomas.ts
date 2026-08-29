/**
 * Idiomas que entiende Orden: español e inglés, los dos completos.
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

export const IDIOMAS = ['es', 'en'] as const;
export type Idioma = (typeof IDIOMAS)[number];

export const IDIOMA_POR_DEFECTO: Idioma = 'es';
/** Al que caen las traducciones incompletas. */
export const IDIOMA_DE_RESPALDO: Idioma = 'en';

export interface FichaIdioma {
  /** Cómo lo llaman quienes lo hablan. Nunca "Spanish" en la lista de idiomas. */
  nombre: string;
  /** Locale para Intl: manda el separador de miles, el decimal y los meses. */
  locale: string;
  bandera: string;
}

export const FICHA: Record<Idioma, FichaIdioma> = {
  es: { nombre: 'Español', locale: 'es-PY', bandera: '🇵🇾' },
  en: { nombre: 'English', locale: 'en-US', bandera: '🇺🇸' },
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
  es: 'PYG', en: 'USD',
};

/**
 * Moneda en la que se le cobra la suscripción. Guaraníes solo para quien
 * lee en español; el resto del mundo, dólares. Cuando abramos un país
 * nuevo se agrega su fila en `precios` y se toca este mapa.
 */
export const MONEDA_DE_COBRO: Record<Idioma, string> = {
  es: 'PYG', en: 'USD',
};
