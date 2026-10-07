/**
 * «TAMBIÉN VENDO PRODUCTOS» (121): el profe de tenis que vende raquetas y
 * pelotas, el trainer que vende proteína, guantes y bandas.
 *
 * El diccionario lo incluye como `t.vendoProductos` (ver es.ts y pt.ts). Lo
 * llenan el interruptor de Ajustes (VendoProductos.tsx), la tarjeta del
 * panel (PanelProfe.tsx), la sección del reporte (ReporteAlumnos.tsx) y el
 * cierre del día de quien lo prendió (CierreAlumnos.tsx, 128). Los
 * textos del Excel NO van acá: el libro se compila suelto para las pruebas y
 * los lleva en src/lib/reportes/textos-alumnos.ts.
 *
 * LAS PALABRAS DEL OFICIO. Como en reportes-alumnos.ts, las frases reciben
 * las palabras del profe o del trainer (`PalabrasAlumnos`): «De tus clases»
 * para uno, «De tus sesiones» para el otro, sin escribir cada frase dos veces.
 */
import type { PalabrasAlumnos } from './reportes-alumnos';

const uno = (n: number, singular: string, plural: string) => (n === 1 ? singular : plural);
/** El número y «unidades» no se separan de renglón. */
const NBSP = '\u00a0';

export const vendoProductosEs = {
  /** El interruptor, en Ajustes › Tu negocio. */
  ajustes: {
    titulo: 'También vendo productos',
    ejemplos: {
      profe: 'Raquetas, pelotas, libros, materiales…',
      trainer: 'Proteína, guantes, bandas, suplementos…',
    },
    detalle: (ejemplos: string, p: PalabrasAlumnos) =>
      `${ejemplos} Cargalos con su costo y vendelos desde Orden: vas a ver cuánto ganás con ellos, aparte de tus ${p.clases}, y a la noche cerrás el día con lo que entró y lo que salió.`,
    prendido: 'Listo: Productos, Vender y Cierre del día ya están en tu menú.',
    cargarPrimero: 'Cargar productos',
    irAVender: 'Ir a Vender',
    apagado: 'Productos, Vender y Cierre del día salen del menú. Lo que cargaste, lo que vendiste y los días que cerraste quedan guardados, y siguen en tus reportes.',
    /** El detalle de «Tu negocio» en la lista de Ajustes, en estos dos rubros. */
    listaNegocio: 'Nombre, moneda y si vendés productos',
  },

  /** La tarjeta del panel. */
  panel: {
    titulo: (p: PalabrasAlumnos) => `${p.Clases} y productos`,
    deTusClases: (p: PalabrasAlumnos) => `De tus ${p.clases}`,
    deProductos: 'De productos',
    otrosIngresos: 'Otros ingresos',
    ganaste: 'Con los productos ganaste',
    perdiste: 'Con los productos perdiste',
    teCostaron: (costo: string) => `Te costaron ${costo}`,
    vendiste: (vendido: string, unidades: string) => `Vendiste ${vendido} · ${unidades}`,
    unidades: (n: number, texto: string) => `${texto}${NBSP}${uno(n, 'unidad', 'unidades')}`,
    sinVentas: 'Todavía no vendiste productos en este período.',
    vender: 'Vender',
    verProductos: 'Mis productos',
    /** El detalle de «Te queda» cuando hay costo de lo vendido. */
    teQuedaConProductos: 'cobrado menos gastado y lo que te costó lo vendido',
    mercaderiaAparte: (compras: string) =>
      `La mercadería que compraste (${compras}) no se resta entera: solo lo que costó lo que ya vendiste.`,
  },

  /**
   * El cierre del día de quien vende productos (128). Lo demás de esa
   * pantalla usa los textos del cierre de siempre y los del panel de arriba.
   */
  cierre: {
    /** El día sin plata. No reta: no dice «todavía no cargaste nada». */
    sinPlata: 'No entró ni salió plata',
    sinPlataDetalle: (p: PalabrasAlumnos) =>
      `Cuando cobres tus ${p.clases}, vendas un producto o cargues un gasto, lo vas a ver acá.`,
    clasesDadas: (n: number, p: PalabrasAlumnos) => `Diste ${n} ${uno(n, p.clase, p.clases)}.`,
    /** Debajo de «De productos»: lo vendido menos lo que costó. */
    teDejaron: (ganancia: string) => `te dejaron ${ganancia}`,
    perdiste: (perdida: string) => `perdiste ${perdida}`,
  },

  /** La sección del reporte. */
  reporte: {
    titulo: (p: PalabrasAlumnos) => `${p.Clases} y productos`,
    clases: (p: PalabrasAlumnos) => `Cobrado de ${p.clases}`,
    clasesDetalle: (n: number, p: PalabrasAlumnos) => `${n} ${uno(n, `${p.clase} dada`, `${p.clases} dadas`)}`,
    vendidos: 'Productos vendidos',
    unidades: (n: number, texto: string) => `${texto}${NBSP}${uno(n, 'unidad', 'unidades')}`,
    ganaste: 'Ganaste con productos',
    margen: (pct: string) => `${pct} de margen`,
    costoDetalle: (costo: string) => `te costaron ${costo}`,
    colProducto: 'Producto',
    colUnidades: 'Unidades',
    colVendido: 'Vendido',
    colGanancia: 'Ganancia',
    sinVentas: 'Todavía no vendiste productos en este período.',
    sinVentasDetalle: 'Cuando vendas uno desde Vender vas a ver acá cuánto te dejó cada uno.',
    soloConStock: (p: PalabrasAlumnos) => `Cuenta solo los productos de tu lista. Lo que cobraste de tus ${p.paquetes} va en «Cobrado de ${p.clases}».`,
    mercaderia: (compras: string) =>
      `Compraste ${compras} de mercadería en el período. En «Te quedó» no se resta entera: solo lo que costó lo que vendiste.`,
    /** Debajo de «Gastos por categoría», cuando la compra de mercadería va aparte (106). */
    gastosSinMercaderia: (compras: string) =>
      `Sin la mercadería que compraste (${compras}): no es un gasto, porque lo que vendiste ya descuenta lo que te costó.`,
  },
};

export const vendoProductosPt: typeof vendoProductosEs = {
  ajustes: {
    titulo: 'Também vendo produtos',
    ejemplos: {
      profe: 'Raquetes, bolas, livros, materiais…',
      trainer: 'Proteína, luvas, elásticos, suplementos…',
    },
    detalle: (ejemplos, p) =>
      `${ejemplos} Cadastre com o custo e venda pelo Orden: você vê quanto ganha com eles, separado das suas ${p.clases}, e à noite você fecha o dia com o que entrou e o que saiu.`,
    prendido: 'Pronto: Produtos, Vender e Fechamento do dia já estão no seu menu.',
    cargarPrimero: 'Cadastrar produtos',
    irAVender: 'Ir pra Vender',
    apagado: 'Produtos, Vender e Fechamento do dia saem do menu. O que você cadastrou, o que vendeu e os dias que fechou ficam guardados e continuam nos seus relatórios.',
    listaNegocio: 'Nome, moeda e se você vende produtos',
  },

  panel: {
    titulo: (p) => `${p.Clases} e produtos`,
    deTusClases: (p) => `Das suas ${p.clases}`,
    deProductos: 'De produtos',
    otrosIngresos: 'Outras entradas',
    ganaste: 'Com os produtos você ganhou',
    perdiste: 'Com os produtos você perdeu',
    teCostaron: (costo) => `Custaram ${costo}`,
    vendiste: (vendido, unidades) => `Vendeu ${vendido} · ${unidades}`,
    unidades: (n, texto) => `${texto}${NBSP}${uno(n, 'unidade', 'unidades')}`,
    sinVentas: 'Você ainda não vendeu produtos neste período.',
    vender: 'Vender',
    verProductos: 'Meus produtos',
    teQuedaConProductos: 'recebido menos gasto e o custo do que você vendeu',
    mercaderiaAparte: (compras) =>
      `A mercadoria que você comprou (${compras}) não desconta inteira: só o custo do que você já vendeu.`,
  },

  cierre: {
    sinPlata: 'Não entrou nem saiu dinheiro',
    sinPlataDetalle: (p) =>
      `Quando você receber das suas ${p.clases}, vender um produto ou lançar uma despesa, aparece aqui.`,
    clasesDadas: (n, p) => `Você deu ${n} ${uno(n, p.clase, p.clases)}.`,
    teDejaron: (ganancia) => `deixaram ${ganancia}`,
    perdiste: (perdida) => `você perdeu ${perdida}`,
  },

  reporte: {
    titulo: (p) => `${p.Clases} e produtos`,
    clases: (p) => `Recebido de ${p.clases}`,
    clasesDetalle: (n, p) => `${n} ${uno(n, `${p.clase} dada`, `${p.clases} dadas`)}`,
    vendidos: 'Produtos vendidos',
    unidades: (n, texto) => `${texto}${NBSP}${uno(n, 'unidade', 'unidades')}`,
    ganaste: 'Ganhou com produtos',
    margen: (pct) => `${pct} de margem`,
    costoDetalle: (costo) => `custaram ${costo}`,
    colProducto: 'Produto',
    colUnidades: 'Unidades',
    colVendido: 'Vendido',
    colGanancia: 'Lucro',
    sinVentas: 'Você ainda não vendeu produtos neste período.',
    sinVentasDetalle: 'Quando vender um pelo Vender, você vê aqui quanto cada um deixou.',
    soloConStock: (p) => `Conta só os produtos da sua lista. O que você recebeu dos seus ${p.paquetes} vai em «Recebido de ${p.clases}».`,
    mercaderia: (compras) =>
      `Você comprou ${compras} de mercadoria no período. Em «Sobrou» não desconta inteira: só o custo do que você vendeu.`,
    gastosSinMercaderia: (compras) =>
      `Sem a mercadoria que você comprou (${compras}): não é uma despesa, porque o que você vendeu já desconta o que custou.`,
  },
};
