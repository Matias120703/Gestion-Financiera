/**
 * TEXTOS DE LAS PIEZAS QUE COMPARTEN LOS CINCO REPORTES (23/09).
 *
 * El selector de rango (con «Este ciclo» y «Ciclo pasado» para la cuenta
 * personal), el indicador con la flecha contra el período anterior, el
 * gráfico por día y la tarjeta de descarga, que dice qué hojas trae el
 * archivo. Viven en `src/components/reportes/comunes`.
 *
 * El diccionario lo incluye como `t.reportesComunes` (ver es.ts y pt.ts).
 * Lo propio de cada reporte va en su archivo: `reportes-comercio.ts`,
 * `reportes-servicios.ts`, `reportes-alumnos.ts`, `reportes-campo.ts` y
 * `reportes-personal.ts`. Los nombres de las hojas NO van acá: salen del
 * mismo lugar que el Excel (src/lib/reporte-textos.ts y los textos de cada
 * libro), así la tarjeta no puede anunciar una hoja con otro nombre.
 */
export const reportesComunesEs = {
  /** Los botones del rango. Los de siempre, más el ciclo de cobro. */
  rango: {
    hoy: 'Hoy',
    ayer: 'Ayer',
    semana: 'Esta semana',
    mes: 'Este mes',
    mesPasado: 'Mes pasado',
    anio: 'Este año',
    siempre: 'Todo',
    /** De tu último cobro a hoy. */
    ciclo: 'Este ciclo',
    /** De cobro a cobro, el anterior. */
    cicloPasado: 'Ciclo pasado',
    /** Debajo del selector, cuando hay ciclo: «Tu ciclo va del 5 al 4». */
    cicloExplicado: (dia: number) => `Tu ciclo va de cobro a cobro: empieza el ${dia} de cada mes.`,
  },

  /** La tarjeta para bajar el Excel. */
  descarga: {
    titulo: 'Descargar el Excel del período',
    /** «Trae: Resumen, Productos, Movimientos y Gastos». Recibe la lista ya unida; sin contar, porque las que salen «si hubo» no se sabe si salen. */
    hojas: (lista: string) => `Trae: ${lista}.`,
    /** Una hoja que sale solo si el período tiene con qué llenarla. */
    siHubo: (nombre: string) => `${nombre} (si hubo)`,
    /** El último separador de la lista: «A, B y C». */
    y: 'y',
  },

  /** El indicador con la flecha. */
  indicador: {
    /** Lo que se lee al pasar el dedo o con lector de pantalla. */
    contraAnterior: (pct: string, antes: string) => `${pct} contra el período anterior (${antes})`,
    /** Cuando antes no hubo nada, no hay porcentaje que mostrar. */
    antesNada: 'Antes: nada',
  },

  /** El gráfico por día. */
  grafico: {
    titulo: 'Día por día',
    /** Con más de 92 días se muestran los últimos 92: más barras no se leen. */
    recortado: (n: number) => `Se muestran los últimos ${n} días del período.`,
    gastado: (monto: string) => `Gastado ${monto}`,
    gastos: 'Gastos',
  },
};

export const reportesComunesPt: typeof reportesComunesEs = {
  rango: {
    hoy: 'Hoje',
    ayer: 'Ontem',
    semana: 'Esta semana',
    mes: 'Este mês',
    mesPasado: 'Mês passado',
    anio: 'Este ano',
    siempre: 'Tudo',
    ciclo: 'Este ciclo',
    cicloPasado: 'Ciclo passado',
    cicloExplicado: (dia: number) => `Seu ciclo vai de pagamento a pagamento: começa no dia ${dia} de cada mês.`,
  },
  descarga: {
    titulo: 'Baixar o Excel do período',
    hojas: (lista: string) => `Abas: ${lista}.`,
    siHubo: (nombre: string) => `${nombre} (se houver)`,
    y: 'e',
  },
  indicador: {
    contraAnterior: (pct: string, antes: string) => `${pct} em relação ao período anterior (${antes})`,
    antesNada: 'Antes: nada',
  },
  grafico: {
    titulo: 'Dia a dia',
    recortado: (n: number) => `Mostrando os últimos ${n} dias do período.`,
    gastado: (monto: string) => `Gasto ${monto}`,
    gastos: 'Despesas',
  },
};
