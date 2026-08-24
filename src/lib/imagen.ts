/**
 * Achica una foto ANTES de subirla.
 *
 * Por qué importa: la cámara de un celular de hoy saca fotos de 3 a 6 MB. Un
 * comerciante que le saca foto a diez comprobantes por día sube 50 MB
 * diarios. A los seis meses son 9 GB de storage —que se paga todos los
 * meses— para leer un ticket que en 150 KB se lee igual de bien.
 *
 * Además, en una red mala subir 4 MB tarda tanto que la persona cierra la
 * app pensando que se colgó.
 *
 * Todo pasa en el navegador. Al servidor ya le llega chica.
 */

/** Lado más largo, en píxeles. Suficiente para leer un ticket impreso. */
const LADO_MAXIMO = 1600;
const CALIDAD = 0.72;

export interface FotoLista {
  archivo: File;
  ancho: number;
  alto: number;
  /** Cuánto pesaba antes. Sirve para mostrar el ahorro y para depurar. */
  bytesOriginales: number;
}

function extensionDe(mime: string): string {
  if (mime === 'image/webp') return 'webp';
  if (mime === 'image/png') return 'png';
  return 'jpg';
}

/**
 * Devuelve una versión liviana de la imagen.
 *
 * Si algo falla —un formato que el navegador no sabe decodificar, como HEIC
 * en un navegador viejo— devuelve el archivo original. Mejor subir una foto
 * pesada que perder el comprobante.
 */
export async function comprimirFoto(original: File): Promise<FotoLista> {
  const bytesOriginales = original.size;

  try {
    const bitmap = await crearBitmap(original);
    const escala = Math.min(1, LADO_MAXIMO / Math.max(bitmap.width, bitmap.height));
    const ancho = Math.max(1, Math.round(bitmap.width * escala));
    const alto = Math.max(1, Math.round(bitmap.height * escala));

    const lienzo = document.createElement('canvas');
    lienzo.width = ancho;
    lienzo.height = alto;

    const ctx = lienzo.getContext('2d');
    if (!ctx) throw new Error('sin contexto 2d');

    // Fondo blanco: un PNG con transparencia sobre WebP sin fondo sale con
    // manchas negras al imprimirlo.
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, ancho, alto);
    ctx.drawImage(bitmap, 0, 0, ancho, alto);
    if ('close' in bitmap) bitmap.close();

    const tipo = soportaWebp() ? 'image/webp' : 'image/jpeg';
    const blob = await new Promise<Blob | null>((resolver) =>
      lienzo.toBlob(resolver, tipo, CALIDAD));

    // Si comprimir no ganó nada (una foto ya chica), se queda la original.
    if (!blob || blob.size >= bytesOriginales) {
      return { archivo: original, ancho, alto, bytesOriginales };
    }

    const nombre = `comprobante-${Date.now()}.${extensionDe(tipo)}`;
    return {
      archivo: new File([blob], nombre, { type: tipo }),
      ancho,
      alto,
      bytesOriginales,
    };
  } catch {
    return { archivo: original, ancho: 0, alto: 0, bytesOriginales };
  }
}

async function crearBitmap(archivo: File): Promise<ImageBitmap> {
  // createImageBitmap respeta la orientación EXIF con 'from-image'. Sin eso,
  // las fotos verticales de Android salen acostadas.
  if (typeof createImageBitmap === 'function') {
    return createImageBitmap(archivo, { imageOrientation: 'from-image' } as ImageBitmapOptions);
  }
  throw new Error('sin createImageBitmap');
}

let soporteWebp: boolean | null = null;

function soportaWebp(): boolean {
  if (soporteWebp !== null) return soporteWebp;
  try {
    const lienzo = document.createElement('canvas');
    lienzo.width = 1;
    lienzo.height = 1;
    soporteWebp = lienzo.toDataURL('image/webp').startsWith('data:image/webp');
  } catch {
    soporteWebp = false;
  }
  return soporteWebp;
}
