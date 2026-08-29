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
  // Ejemplo — descomentalo y cambiale los datos cuando tengas el primer video:
  //
  // {
  //   archivo: 'cargar-venta.mp4',
  //   portada: 'cargar-venta.jpg',
  //   titulo: 'Cargar una venta hablando',
  //   detalle: 'Se lo contás como se lo contarías a alguien y queda cargado con su ganancia.',
  //   en: {
  //     titulo: 'Recording a sale by voice',
  //     detalle: 'You say it out loud and it lands with its profit already calculated.',
  //   },
  // },
];

export const HAY_DEMOS = DEMOS.length > 0;
