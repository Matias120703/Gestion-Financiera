/**
 * LOS VIDEOS DE LA PORTADA
 *
 * Acá se anotan los videos que muestran Orden por dentro. La lista arranca
 * vacía a propósito: mientras no haya ninguno, la portada no muestra la
 * sección. Una sección de videos vacía se ve peor que no tenerla.
 *
 * PARA AGREGAR UNO:
 *
 *   1. Grabá la pantalla del celular usando Orden (30 a 60 segundos alcanza).
 *   2. Guardá el archivo en  public/videos/  — por ejemplo  cargar-venta.mp4
 *   3. Sacale una foto a la primera pantalla del video y guardala al lado,
 *      como  cargar-venta.jpg . Eso es lo que se ve antes de apretar play.
 *   4. Agregá acá abajo el bloque, copiando el ejemplo comentado.
 *
 * TRES COSAS QUE IMPORTAN MÁS DE LO QUE PARECEN:
 *
 *   · SIN AUDIO. Nadie mira la portada con el volumen prendido, y un video
 *     que arranca hablando hace que la gente cierre la pestaña. Si hay algo
 *     que explicar, va escrito en el `detalle`.
 *   · LIVIANO. Menos de 8 MB por video. Muchos de tus clientes lo van a abrir
 *     con datos del celular: un video pesado se traga el crédito de alguien
 *     que todavía no decidió si te va a pagar. El video no se descarga hasta
 *     que lo aprietan, pero igual conviene que sea chico.
 *   · SIN DATOS REALES. Si grabás con la cuenta de un cliente, sus números
 *     terminan en internet. Grabá con una cuenta de prueba.
 *
 * El `en` es opcional, pero si algún día se traduce la portada al inglés,
 * los videos ya tienen que tener su texto o queda media página en español.
 */
export type Demo = {
  /** Nombre del archivo dentro de public/videos/ — con extensión. */
  archivo: string;
  /** Imagen que se ve antes de apretar play, dentro de public/videos/. */
  portada?: string;
  /** Título corto: qué se está viendo. */
  titulo: string;
  /** Una línea explicando por qué eso le sirve a quien mira. */
  detalle: string;
  /** Lo mismo en inglés, para cuando se traduzca la portada. */
  en?: { titulo: string; detalle: string };
};

export const DEMOS: Demo[] = [
  {
    archivo: '2-cargar-hablando.mp4',
    portada: '2-cargar-hablando.jpg',
    titulo: 'Contale una venta hablando',
    detalle: 'Decís «vendí dos perfumes a 45 mil» y sale armada: el producto de tu catálogo, la cantidad, el precio y el stock ya descontado.',
    en: {
      titulo: 'Log a sale by talking',
      detalle: 'You say «I sold two perfumes at 45 thousand» and it comes back complete: the product from your catalogue, the amount, the price and the stock already deducted.',
    },
  },
  {
    archivo: '1-cargar-gasto.mp4',
    portada: '1-cargar-gasto.jpg',
    titulo: 'Un gasto, en siete segundos',
    detalle: 'El monto, en qué fue, y listo. Sin formularios de veinte campos ni categorías que adivinar.',
    en: {
      titulo: 'An expense, in seven seconds',
      detalle: 'The amount, what it was for, done. No twenty-field forms and no categories to guess.',
    },
  },
  {
    archivo: '3-reportes-excel.mp4',
    portada: '3-reportes-excel.jpg',
    titulo: 'Tu Excel, cuando lo necesites',
    detalle: 'Cinco hojas con el resumen, los productos, los movimientos, los gastos y el día por día. Se baja al celular y se abre donde quieras.',
    en: {
      titulo: 'Your spreadsheet, whenever you need it',
      detalle: 'Five sheets: summary, products, entries, expenses and a day-by-day view. It downloads to your phone and opens anywhere.',
    },
  },
];

export const HAY_DEMOS = DEMOS.length > 0;
