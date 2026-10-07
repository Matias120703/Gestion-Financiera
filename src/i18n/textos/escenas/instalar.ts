/**
 * TEXTOS DE LA ESCENA «INSTALAR» DE LA PORTADA (02/10/2026): «Cómo poner
 * Orden en tu pantalla de inicio», con un teléfono dibujado paso a paso
 * —iPhone con Safari, Android con Chrome— y el botón verdadero resaltado en
 * cada paso. La misma guía ilustrada se ve en /instalar.
 *
 * Lo que DICE cada paso no vive acá: es `instalarGuia.iphone1…android4` de
 * es.ts y pt.ts, que la guía lee con `useTextos()` igual que la lista
 * compacta de Ajustes (ahí siguen «no desde Safari» y «tres puntos «···»»,
 * que la prueba busca). Acá vive lo propio de la escena: el título y el
 * apoyo, los nombres de los menús que se dibujan adentro del teléfono
 * —letra por letra como los muestra cada sistema en cada idioma—, los
 * botones de la guía y el resumen de cada pantalla para el lector de
 * pantalla.
 *
 * Mismo patrón que vitrina.ts: `instalarEs`, el tipo sale del español y el
 * portugués tiene que tener la misma forma. Sin importar nada en ejecución
 * (la prueba lo compila suelto). Sin `as const`.
 *
 * Verdades cuidadas: Orden no se baja de ninguna tienda; en iPhone agregarla
 * a la pantalla de inicio es la única forma de recibir avisos (regla de
 * Apple); en Android los avisos ya llegan sin instalar; los nombres de los
 * menús cambian un poco según la versión (lo dice `android2`, y el dibujo
 * marca el nombre alternativo con un anillo punteado).
 */
export const instalarEs = {
  etiqueta: 'En tu celular',
  titulo: 'Cómo poner Orden en tu pantalla de inicio',
  apoyo: 'No se baja de ninguna tienda: se agrega desde el navegador, en tres o cuatro toques.',
  /** La pastilla ámbar, solo en la pestaña iPhone: la regla de Apple, en una línea. */
  avisoIphone: 'En iPhone, sin esto no llegan los avisos',
  /** aria-label de las dos pestañas. */
  sistemas: 'Elegí tu teléfono',
  iphone: 'iPhone',
  android: 'Android',
  /**
   * Lo que se ve dibujado adentro del teléfono, letra por letra como lo
   * muestra cada sistema en este idioma. Son dibujos genéricos: nada de
   * logos de Apple, Safari, Chrome ni Google.
   */
  menus: {
    direccion: 'orden.com.py',
    /** Como queda en la pantalla de inicio: el `short_name` del manifest. */
    nombreApp: 'Orden',
    // iPhone, Safari: la hoja de compartir y la pantalla «Agregar a inicio».
    compartir: 'Compartir',
    copiar: 'Copiar',
    favoritos: 'Agregar a favoritos',
    agregarAInicio: 'Agregar a inicio',
    buscar: 'Buscar en la página',
    agregar: 'Agregar',
    cancelar: 'Cancelar',
    // Android, Chrome: el menú de los tres puntos y el cuadro de instalar.
    nuevaPestania: 'Nueva pestaña',
    historial: 'Historial',
    descargas: 'Descargas',
    instalarApp: 'Instalar aplicación',
    agregarPantalla: 'Agregar a pantalla de inicio',
    configuracion: 'Configuración',
    instalar: 'Instalar',
  },
  pasoDe: (n: number, total: number) => `Paso ${n} de ${total}`,
  /** aria-label de los cuatro puntos numerados, y de cada uno. */
  pasos: 'Pasos de la guía',
  irAlPaso: (n: number) => `Ir al paso ${n}`,
  anterior: 'Anterior',
  siguiente: 'Siguiente',
  /** Lo que dice «Siguiente» en el último paso. */
  empezarDeNuevo: 'Empezar de nuevo',
  /** Lo que lee el lector de pantalla en lugar del teléfono, paso por paso (índice = paso − 1). */
  resumen: {
    iphone: [
      'Un iPhone con Orden abierto en el navegador y el botón Compartir resaltado en la barra de abajo.',
      'La hoja de compartir abierta, con «Agregar a inicio» resaltado en la lista de opciones.',
      'La pantalla «Agregar a inicio» con el ícono de Orden y el botón «Agregar» resaltado arriba a la derecha.',
      'La pantalla de inicio con el ícono nuevo de Orden, y Orden abierta a pantalla completa desde ahí, sin la barra del navegador.',
    ],
    android: [
      'Un Android con Orden abierto en el navegador y los tres puntos resaltados arriba a la derecha.',
      'El menú del navegador abierto, con «Instalar aplicación» resaltado.',
      'El cuadro de confirmación con el ícono de Orden y el botón «Instalar» resaltado.',
      'La pantalla de inicio con el ícono nuevo de Orden, y Orden abierta a pantalla completa, sin la barra del navegador arriba.',
    ],
  },
  pasarGuia: '¿Se lo querés pasar a alguien?',
  guiaPropia: 'Esta guía tiene su propia página',
  paraMandar: ', para mandarla por WhatsApp.',
  // Acá nada avanza solo, así que de los tres solo se usa la forma común
  // de los módulos de escena; se dejan para que todos tengan la misma.
  pausar: 'Pausar',
  seguir: 'Seguir',
  verDeNuevo: 'Ver de nuevo',
};

export type TextosInstalar = typeof instalarEs;

export const instalarPt: TextosInstalar = {
  etiqueta: 'No seu celular',
  titulo: 'Como colocar o Orden na tela de início',
  apoyo: 'Não se baixa de nenhuma loja: é adicionado pelo navegador, em três ou quatro toques.',
  avisoIphone: 'No iPhone, sem isso os avisos não chegam',
  sistemas: 'Escolha seu celular',
  iphone: 'iPhone',
  android: 'Android',
  menus: {
    direccion: 'orden.com.py',
    nombreApp: 'Orden',
    compartir: 'Compartilhar',
    copiar: 'Copiar',
    favoritos: 'Adicionar aos Favoritos',
    agregarAInicio: 'Adicionar à Tela de Início',
    buscar: 'Buscar na Página',
    agregar: 'Adicionar',
    cancelar: 'Cancelar',
    nuevaPestania: 'Nova guia',
    historial: 'Histórico',
    descargas: 'Downloads',
    instalarApp: 'Instalar app',
    agregarPantalla: 'Adicionar à tela inicial',
    configuracion: 'Configurações',
    instalar: 'Instalar',
  },
  pasoDe: (n: number, total: number) => `Passo ${n} de ${total}`,
  pasos: 'Passos do guia',
  irAlPaso: (n: number) => `Ir pro passo ${n}`,
  anterior: 'Anterior',
  siguiente: 'Próximo',
  empezarDeNuevo: 'Começar de novo',
  resumen: {
    iphone: [
      'Um iPhone com o Orden aberto no navegador e o botão Compartilhar destacado na barra de baixo.',
      'A folha de compartilhar aberta, com «Adicionar à Tela de Início» destacado na lista de opções.',
      'A tela «Adicionar à Tela de Início» com o ícone do Orden e o botão «Adicionar» destacado no canto superior direito.',
      'A tela de início com o ícone novo do Orden, e o Orden aberto em tela cheia a partir dele, sem a barra do navegador.',
    ],
    android: [
      'Um Android com o Orden aberto no navegador e os três pontinhos destacados no canto superior direito.',
      'O menu do navegador aberto, com «Instalar app» destacado.',
      'A caixa de confirmação com o ícone do Orden e o botão «Instalar» destacado.',
      'A tela de início com o ícone novo do Orden, e o Orden aberto em tela cheia, sem a barra do navegador em cima.',
    ],
  },
  pasarGuia: 'Quer passar pra alguém?',
  guiaPropia: 'Este guia tem a própria página',
  paraMandar: ', pra mandar pelo WhatsApp.',
  pausar: 'Pausar',
  seguir: 'Continuar',
  verDeNuevo: 'Ver de novo',
};
