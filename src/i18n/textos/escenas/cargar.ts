/**
 * TEXTOS DE LA ESCENA «CARGAR» DE LA PORTADA (02/10/2026). Los usa
 * `src/components/portada/escenas/EscenaCargar.tsx`, que recibe el idioma y
 * elige `cargarEs` o `cargarPt`. Mismo patrón que vitrina.ts: no se registra
 * en es.ts ni en pt.ts, solo `import type`, y el portugués tiene que tener
 * exactamente la misma forma que el español (TypeScript lo obliga).
 *
 * Acá vive SOLO lo propio de la escena: el título, lo que se dice en cada
 * ejemplo, los montos de ejemplo (como números: se formatean con `precio`),
 * los resúmenes para el lector de pantalla y las cinco frases que antes
 * rotaban en page.tsx. Lo que la pantalla dibujada repite de la app —
 * «Registrar rápido», «Revisá antes de guardar», «Guardar», «Efectivo»— se
 * lee de `useTextos()` (`t.captura.*`, `t.comun.*`): así dice lo mismo que la
 * app en los dos idiomas, letra por letra.
 *
 * NADA QUE NO SEA VERDAD. Los tres ejemplos son cosas que la captura entiende
 * hoy (una venta con dos unidades de un producto del catálogo, un gasto con
 * foto del comprobante, un fiado), y en los tres hay revisión antes de
 * guardar. Los montos son de ejemplo y la leyenda bajo el celular lo dice.
 * Comprobación de la prueba: `cantidad × precioUnitario === total` en voz.
 */
export const cargarEs = {
  etiqueta: 'Cómo se carga',
  titulo: 'Cargar te tiene que llevar menos que cobrar.',
  apoyo: 'Lo decís, le sacás una foto o lo escribís. Orden lo ordena y vos confirmás antes de guardar.',
  /** aria-label del grupo de pestañas. */
  pestanias: 'Elegí cómo cargar',
  // Las tres pestañas van en tres columnas desde 320 px: `texto` tiene que
  // entrar en un chip de 117 px (a 400 px de ancho) y `corto` en uno de
  // 90 px (a 320 px). `linea` es el renglón de abajo, que explica el modo.
  modos: {
    voz: { texto: 'Hablando', corto: 'Voz', linea: 'Como se lo contarías a alguien.' },
    foto: { texto: 'Con foto', corto: 'Foto', linea: 'Lee el monto y guarda la foto como comprobante.' },
    texto: { texto: 'Escrito', corto: 'Texto', linea: 'Donde no podés hablar, lo escribís igual.' },
  },
  /** El mismo comercio de la vitrina. */
  negocio: 'Perfumería Aurora',
  /** Quien carga, al lado del celular. */
  vos: 'Vos',
  escenas: {
    voz: {
      dicho: 'Vendí dos perfumes a 150 mil cada uno',
      descripcion: 'Perfume',
      cantidad: 2,
      precioUnitario: 150000,
      total: 300000,
      queda: 'Venta cargada · stock descontado',
    },
    foto: {
      descripcion: 'Bolsas y etiquetas',
      total: 150000,
      queda: 'Gasto cargado · comprobante guardado',
    },
    texto: {
      dicho: 'Luis me debe 180 mil',
      quien: 'Luis',
      total: 180000,
      queda: 'Anotado en lo que te deben',
    },
  },
  /** El cronómetro de la grabación: solo los primeros segundos. */
  cronometro: (segundos: number) => `00:0${segundos}`,
  /** El renglón legible de la boleta dibujada; es igual en los dos idiomas. */
  boletaTotal: 'TOTAL',
  resumen: {
    voz: 'Pantalla de la captura de Orden: alguien dice «Vendí dos perfumes a 150 mil cada uno», Orden lo ordena como una venta de Gs. 300.000 y pide confirmar antes de guardar.',
    foto: 'Pantalla de la captura de Orden: una foto a la boleta de un gasto de Gs. 150.000; Orden lee el monto, guarda la foto como comprobante y pide confirmar.',
    texto: 'Pantalla de la captura de Orden: alguien escribe «Luis me debe 180 mil» y queda anotado en lo que te deben, después de confirmar.',
  },
  /** Lo que anuncia el lector de pantalla al tocar Guardar. */
  guardado: (queda: string) => `Listo: ${queda}`,
  notaVendedores: 'Con Pro y Premium, tus vendedores cargan igual desde su celular, sin ver tus costos.',
  /** El `<details>` con las cinco frases. */
  masCosas: 'Más cosas que le podés decir',
  // Las cinco frases que rotaban en page.tsx, tal cual. Todas son cosas que
  // la captura entiende hoy: una venta, un gasto atado a una campaña, un
  // turno, un fiado y un gasto de la casa.
  frases: [
    { rubro: 'Comercio', frase: '«Vendí dos perfumes a 150 mil cada uno»', queda: 'Venta cargada · stock descontado' },
    { rubro: 'Campo', frase: '«Gasté 2 millones en semilla para el Norte»', queda: 'Gasto de la campaña Norte' },
    { rubro: 'Servicios', frase: '«Juan, mañana a las tres, corte con Pedro»', queda: 'Turno anotado en la agenda' },
    { rubro: 'Fiado', frase: '«Luis me debe 180 mil»', queda: 'Anotado en lo que te deben' },
    { rubro: 'Para vos', frase: '«Pagué la luz, 280 mil»', queda: 'Gasto de la casa' },
  ],
  pausar: 'Pausar',
  seguir: 'Seguir',
  verDeNuevo: 'Ver de nuevo',
};

export type TextosCargar = typeof cargarEs;

export const cargarPt: TextosCargar = {
  etiqueta: 'Como se lança',
  titulo: 'Lançar tem que levar menos tempo que receber.',
  apoyo: 'Você fala, tira uma foto ou escreve. O Orden organiza e você confirma antes de salvar.',
  pestanias: 'Escolha como lançar',
  modos: {
    voz: { texto: 'Falando', corto: 'Voz', linea: 'Do jeito que você contaria pra alguém.' },
    foto: { texto: 'Com foto', corto: 'Foto', linea: 'Lê o valor e guarda a foto como comprovante.' },
    texto: { texto: 'Escrito', corto: 'Texto', linea: 'Onde não dá pra falar, você escreve do mesmo jeito.' },
  },
  negocio: 'Perfumaria Aurora',
  vos: 'Você',
  escenas: {
    voz: {
      dicho: 'Vendi dois perfumes a 150 mil cada',
      descripcion: 'Perfume',
      cantidad: 2,
      precioUnitario: 150000,
      total: 300000,
      queda: 'Venda lançada · estoque baixado',
    },
    foto: {
      descripcion: 'Sacolas e etiquetas',
      total: 150000,
      queda: 'Despesa lançada · comprovante guardado',
    },
    texto: {
      dicho: 'O Luís me deve 180 mil',
      quien: 'Luís',
      total: 180000,
      queda: 'Anotado no que te devem',
    },
  },
  cronometro: (segundos: number) => `00:0${segundos}`,
  boletaTotal: 'TOTAL',
  resumen: {
    voz: 'Tela de lançamento do Orden: alguém diz «Vendi dois perfumes a 150 mil cada», o Orden organiza como uma venda de Gs. 300.000 e pede pra confirmar antes de salvar.',
    foto: 'Tela de lançamento do Orden: uma foto do cupom de uma despesa de Gs. 150.000; o Orden lê o valor, guarda a foto como comprovante e pede pra confirmar.',
    texto: 'Tela de lançamento do Orden: alguém escreve «O Luís me deve 180 mil» e fica anotado no que te devem, depois de confirmar.',
  },
  guardado: (queda: string) => `Pronto: ${queda}`,
  notaVendedores: 'Com Pro e Premium, seus vendedores lançam do mesmo jeito pelo celular deles, sem ver seus custos.',
  masCosas: 'Mais coisas que você pode dizer',
  frases: [
    { rubro: 'Comércio', frase: '«Vendi dois perfumes a 150 mil cada»', queda: 'Venda lançada · estoque baixado' },
    { rubro: 'Lavoura', frase: '«Gastei 2 milhões em semente pro Norte»', queda: 'Despesa da safra Norte' },
    { rubro: 'Serviços', frase: '«João, amanhã às três, corte com o Pedro»', queda: 'Horário marcado na agenda' },
    { rubro: 'Fiado', frase: '«O Luís me deve 180 mil»', queda: 'Anotado no que te devem' },
    { rubro: 'Pra você', frase: '«Paguei a luz, 280 mil»', queda: 'Despesa da casa' },
  ],
  pausar: 'Pausar',
  seguir: 'Continuar',
  verDeNuevo: 'Ver de novo',
};
