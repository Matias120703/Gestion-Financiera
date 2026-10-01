import type { Jerga } from '../rubros';

/**
 * LO QUE DICE EL EXCEL DEL PROFE Y DEL PERSONAL TRAINER (23/09).
 *
 * Vive en src/lib y no en i18n por lo mismo que reporte-textos.ts: el libro
 * se compila suelto para las pruebas (probar:calculos), sin Next.
 *
 * Los dos oficios hacen lo mismo con otras palabras: el profe da clases a
 * alumnos que compran paquetes; el trainer da sesiones a clientes que pagan
 * un plan. En la pantalla eso lo resuelve `conJerga`; acá el libro recibe la
 * jerga (`DatosBaseLibro.jerga`) y elige el juego de palabras. Así el
 * archivo que baja un trainer no le habla de «alumnos».
 *
 * Los nombres de las hojas salen de acá, y `hojasAlumnos` los usa para la
 * tarjeta de descarga: la tarjeta no puede anunciar una hoja con otro nombre.
 */

interface Palabras {
  clase: string;
  clases: string;
  Clases: string;
  alumno: string;
  Alumno: string;
  alumnos: string;
  Alumnos: string;
  paquete: string;
  Paquete: string;
  paquetes: string;
  Paquetes: string;
  Materia: string;
}

const PROFE_ES: Palabras = {
  clase: 'clase', clases: 'clases', Clases: 'Clases',
  alumno: 'alumno', Alumno: 'Alumno', alumnos: 'alumnos', Alumnos: 'Alumnos',
  paquete: 'paquete', Paquete: 'Paquete', paquetes: 'paquetes', Paquetes: 'Paquetes',
  Materia: 'Materia',
};
const TRAINER_ES: Palabras = {
  clase: 'sesión', clases: 'sesiones', Clases: 'Sesiones',
  alumno: 'cliente', Alumno: 'Cliente', alumnos: 'clientes', Alumnos: 'Clientes',
  paquete: 'plan', Paquete: 'Plan', paquetes: 'planes', Paquetes: 'Planes',
  Materia: 'Objetivo',
};
const PROFE_PT: Palabras = {
  clase: 'aula', clases: 'aulas', Clases: 'Aulas',
  alumno: 'aluno', Alumno: 'Aluno', alumnos: 'alunos', Alumnos: 'Alunos',
  paquete: 'pacote', Paquete: 'Pacote', paquetes: 'pacotes', Paquetes: 'Pacotes',
  Materia: 'Matéria',
};
const TRAINER_PT: Palabras = {
  clase: 'sessão', clases: 'sessões', Clases: 'Sessões',
  alumno: 'cliente', Alumno: 'Cliente', alumnos: 'clientes', Alumnos: 'Clientes',
  paquete: 'plano', Paquete: 'Plano', paquetes: 'planos', Paquetes: 'Planos',
  Materia: 'Objetivo',
};

function es(p: Palabras) {
  return {
    hojaPorCobrar: 'Por cobrar',
    hojaCobros: 'Cobros',
    hojaAsistencia: 'Asistencia',
    hojaAlumnos: p.Alumnos,
    hojaProgreso: 'Progreso',
    // «También vendo productos» (121): solo con el interruptor prendido.
    hojaProductos: 'Productos',

    // ---- Resumen ----
    resumenTitulo: 'RESUMEN DEL PERÍODO',
    columnaAhora: 'Este período',
    columnaAntes: 'Período anterior',
    plata: 'La plata',
    cobrado: 'Cobrado',
    otrosIngresos: 'Otros ingresos',
    otrosIngresosNota: 'préstamos, aportes: no son cobros',
    totalQueEntro: 'Total que entró',
    gastos: 'Gastos',
    teQuedo: 'Te quedó',
    tusClases: `Tus ${p.clases}`,
    clasesDadas: `${p.Clases} dadas`,
    faltas: 'Faltas',
    asistencia: 'Asistencia',
    cobradoPorClase: `Cobrado por ${p.clase}`,
    // (121) Divide solo lo de las clases: la raqueta vendida no es una clase.
    cobradoPorClaseNota: `lo cobrado de ${p.clases} ÷ ${p.clases} dadas`,
    tusAlumnos: `Tus ${p.alumnos}`,
    activos: `${p.Alumnos} con ${p.paquete} activo`,
    aHoy: 'a hoy',
    nuevos: `${p.Alumnos} nuevos`,
    nuevosNota: `su primer ${p.paquete} es de este período`,
    paquetesVendidos: `${p.Paquetes} vendidos`,
    paquetesTerminados: `${p.Paquetes} que se terminaron`,
    paquetesVencidos: `${p.Paquetes} que vencieron`,
    renovaron: 'De esos, renovaron',
    loQueTeDeben: 'Lo que te deben',
    inscripcionesSinCobrar: `${p.Paquetes} sin cobrar`,
    fiado: 'Fiado',
    totalPorCobrar: 'Total por cobrar',
    paraTenerEnCuenta: 'PARA TENER EN CUENTA',
    gastasteMasDeLoQueCobraste: 'En este período gastaste más de lo que entró.',
    sinCobros: 'No hubo cobros en este período.',
    anulados: (n: number) => `Se anularon ${n} movimiento(s): figuran en Orden pero no suman en ningún total.`,
    sinClasesNoHayPorClase: `Sin ${p.clases} dadas no hay «cobrado por ${p.clase}»: no se inventa.`,

    // ---- Resumen: clases y productos (121) ----
    deTusClases: `De tus ${p.clases}`,
    deTusClasesNota: `${p.paquetes} y cobros sueltos, sin productos`,
    deProductos: 'De productos',
    deProductosNota: 'lo vendido del catálogo',
    tusProductos: 'Tus productos',
    vendido: 'Vendido',
    costoDeLoVendido: 'Costo de lo vendido',
    gananciaProductos: 'Ganaste con productos',
    gananciaProductosNota: 'vendido − costo',
    margen: 'Margen',
    unidades: 'Unidades vendidas',
    comprasMercaderia: 'Compras de mercadería',
    mercaderiaAparteNota: 'no resta en «Te quedó»: lo vendido ya descuenta su costo',
    perdisteConProductos: 'En este período vendiste productos por debajo de lo que te costaron.',

    // ---- Productos (121) ----
    productosTitulo: 'PRODUCTOS VENDIDOS EN EL PERÍODO',
    columnasProductos: ['Producto', 'Unidades', 'Vendido', 'Costo', 'Ganancia', 'Margen'],
    sinProductos: 'No vendiste productos en este período.',
    productosNota: `Lo vendido del catálogo con stock, con el descuento de cada venta repartido. `
      + `Lo cobrado de tus ${p.paquetes} y ${p.clases} está en Cobros y no se cuenta acá.`,

    // ---- Por cobrar ----
    porCobrarTitulo: `LO QUE TE DEBEN, A HOY · ${p.Paquetes.toUpperCase()} SIN COBRAR Y FIADO`,
    columnasPorCobrar: [p.Alumno, p.Paquete, p.Materia, 'Desde', 'Vence', 'Debe'],
    filaFiado: 'Fiado (saldo)',
    nadieTeDebe: 'Nadie te debe nada a hoy.',
    porCobrarEsFoto: 'Es una foto de hoy, no del período: lo que se debe al bajar el archivo.',

    // ---- Cobros ----
    cobrosTitulo: 'COBROS DEL PERÍODO · LIBRO DE INGRESOS',
    columnasCobros: ['Fecha', p.Alumno, p.Paquete, 'Forma de pago', 'Cuenta', 'Monto'],
    totalCobrado: 'TOTAL COBRADO (sin anulados)',
    sinCobrosEnElPeriodo: 'No hubo cobros en este período.',
    cobrosNota: 'Solo cobros: los otros ingresos (préstamos, aportes) están en el Resumen y no son cobros.',

    // ---- Asistencia ----
    asistenciaTitulo: `${p.Clases.toUpperCase()} DADAS Y FALTAS`,
    porSemana: 'POR SEMANA',
    columnasSemana: ['Semana del', `${p.Clases} dadas`, 'Faltas', 'Asistencia'],
    porAlumno: `POR ${p.Alumno.toUpperCase()}`,
    columnasAsistenciaAlumno: [p.Alumno, `${p.Clases} dadas`, 'Faltas', 'Asistencia', `Última ${p.clase}`],
    total: 'TOTAL',
    sinClases: `No se marcaron ${p.clases} ni faltas en este período.`,

    // ---- Alumnos ----
    alumnosTitulo: `${p.Alumnos.toUpperCase()} · UNO POR FILA`,
    columnasAlumnos: [
      p.Alumno, `${p.Paquete} activo`, p.Materia, 'Usadas', 'Quedan', 'Vence',
      `${p.Clases} dadas`, 'Faltas', 'Cobrado', 'Debe hoy', `Última ${p.clase}`,
    ],
    alumnosNota: `«${p.Paquete} activo», «Usadas», «Quedan», «Vence» y «Debe hoy» son de hoy; `
      + `«${p.Clases} dadas», «Faltas» y «Cobrado», del período.`,
    sinAlumnos: `Todavía no hay ${p.alumnos} con ${p.paquetes}.`,

    // ---- Gastos: el detalle, debajo de las categorías ----
    cadaGasto: 'CADA GASTO DEL PERÍODO',
    columnasCadaGasto: ['Fecha', 'Descripción', 'Categoría', 'Forma de pago', 'Cuenta', 'Monto'],
    // (121) La compra de mercadería, aparte de la tabla (regla de la 106).
    mercaderiaAparteTitulo: 'COMPRASTE MERCADERÍA · APARTE, NO RESTA EN «TE QUEDÓ»',
    columnasMercaderia: ['', 'Categoría', 'Total comprado', 'Movimientos'],
    mercaderia: 'Mercadería',
    mercaderiaAparteGastos: 'No está en la tabla de arriba ni en «Gastos»: lo que vendiste ya descuenta lo que te costó '
      + '(«Costo de lo vendido», en el Resumen). Cada compra está en la lista de abajo.',

    // ---- Progreso (solo el trainer) ----
    progresoTitulo: 'PROGRESO DE TUS CLIENTES EN EL PERÍODO',
    columnasProgreso: [
      'Cliente', 'Medidas', 'Peso inicial', 'Peso final', 'Cambio de peso',
      'Cintura inicial', 'Cintura final', 'Cambio de cintura',
      'Grasa inicial', 'Grasa final', 'Cambio de grasa', 'Método de grasa',
      'Última medida', 'Días sin medirse', 'Rutina vigente',
    ],
    promedio: 'PROMEDIO',
    progresoNota: 'Primera contra última medida del período, de quien tiene dos o más. '
      + 'La grasa se compara solo si las dos se midieron con el mismo método. Peso en kg, cintura en cm, grasa en %.',
    sinRutina: 'sin rutina',
    sinMedidas: 'Todavía no hay clientes con un plan activo ni medidas en este período.',
  };
}

type TextosAlumnos = ReturnType<typeof es>;

function pt(p: Palabras): TextosAlumnos {
  return {
    hojaPorCobrar: 'A receber',
    hojaCobros: 'Recebimentos',
    hojaAsistencia: 'Frequência',
    hojaAlumnos: p.Alumnos,
    hojaProgreso: 'Progresso',
    hojaProductos: 'Produtos',

    resumenTitulo: 'RESUMO DO PERÍODO',
    columnaAhora: 'Este período',
    columnaAntes: 'Período anterior',
    plata: 'O dinheiro',
    cobrado: 'Recebido',
    otrosIngresos: 'Outras entradas',
    otrosIngresosNota: 'empréstimos, aportes: não são recebimentos',
    totalQueEntro: 'Total que entrou',
    gastos: 'Despesas',
    teQuedo: 'Sobrou',
    tusClases: `Suas ${p.clases}`,
    clasesDadas: `${p.Clases} dadas`,
    faltas: 'Faltas',
    asistencia: 'Frequência',
    cobradoPorClase: `Recebido por ${p.clase}`,
    cobradoPorClaseNota: `o recebido das ${p.clases} ÷ ${p.clases} dadas`,
    tusAlumnos: `Seus ${p.alumnos}`,
    activos: `${p.Alumnos} com ${p.paquete} ativo`,
    aHoy: 'hoje',
    nuevos: `${p.Alumnos} novos`,
    nuevosNota: `o primeiro ${p.paquete} é deste período`,
    paquetesVendidos: `${p.Paquetes} vendidos`,
    paquetesTerminados: `${p.Paquetes} que terminaram`,
    paquetesVencidos: `${p.Paquetes} que venceram`,
    renovaron: 'Desses, renovaram',
    loQueTeDeben: 'O que te devem',
    inscripcionesSinCobrar: `${p.Paquetes} sem receber`,
    fiado: 'Fiado',
    totalPorCobrar: 'Total a receber',
    paraTenerEnCuenta: 'PRA LEVAR EM CONTA',
    gastasteMasDeLoQueCobraste: 'Neste período você gastou mais do que entrou.',
    sinCobros: 'Não houve recebimentos neste período.',
    anulados: (n: number) => `${n} movimento(s) cancelado(s): aparecem no Orden mas não entram em nenhum total.`,
    sinClasesNoHayPorClase: `Sem ${p.clases} dadas não há «recebido por ${p.clase}»: não se inventa.`,

    deTusClases: `Das suas ${p.clases}`,
    deTusClasesNota: `${p.paquetes} e recebimentos avulsos, sem produtos`,
    deProductos: 'De produtos',
    deProductosNota: 'o vendido do catálogo',
    tusProductos: 'Seus produtos',
    vendido: 'Vendido',
    costoDeLoVendido: 'Custo do vendido',
    gananciaProductos: 'Ganhou com produtos',
    gananciaProductosNota: 'vendido − custo',
    margen: 'Margem',
    unidades: 'Unidades vendidas',
    comprasMercaderia: 'Compras de mercadoria',
    mercaderiaAparteNota: 'não desconta em «Sobrou»: o vendido já desconta o custo',
    perdisteConProductos: 'Neste período você vendeu produtos abaixo do que custaram.',

    productosTitulo: 'PRODUTOS VENDIDOS NO PERÍODO',
    columnasProductos: ['Produto', 'Unidades', 'Vendido', 'Custo', 'Lucro', 'Margem'],
    sinProductos: 'Você não vendeu produtos neste período.',
    productosNota: `O vendido do catálogo com estoque, com o desconto de cada venda repartido. `
      + `O recebido dos seus ${p.paquetes} e ${p.clases} está em Recebimentos e não entra aqui.`,

    porCobrarTitulo: `O QUE TE DEVEM, HOJE · ${p.Paquetes.toUpperCase()} SEM RECEBER E FIADO`,
    columnasPorCobrar: [p.Alumno, p.Paquete, p.Materia, 'Desde', 'Vence', 'Deve'],
    filaFiado: 'Fiado (saldo)',
    nadieTeDebe: 'Ninguém te deve nada hoje.',
    porCobrarEsFoto: 'É uma foto de hoje, não do período: o que se deve ao baixar o arquivo.',

    cobrosTitulo: 'RECEBIMENTOS DO PERÍODO · LIVRO DE ENTRADAS',
    columnasCobros: ['Data', p.Alumno, p.Paquete, 'Forma de pagamento', 'Conta', 'Valor'],
    totalCobrado: 'TOTAL RECEBIDO (sem cancelados)',
    sinCobrosEnElPeriodo: 'Não houve recebimentos neste período.',
    cobrosNota: 'Só recebimentos: as outras entradas (empréstimos, aportes) estão no Resumo e não são recebimentos.',

    asistenciaTitulo: `${p.Clases.toUpperCase()} DADAS E FALTAS`,
    porSemana: 'POR SEMANA',
    columnasSemana: ['Semana de', `${p.Clases} dadas`, 'Faltas', 'Frequência'],
    porAlumno: `POR ${p.Alumno.toUpperCase()}`,
    columnasAsistenciaAlumno: [p.Alumno, `${p.Clases} dadas`, 'Faltas', 'Frequência', `Última ${p.clase}`],
    total: 'TOTAL',
    sinClases: `Não foram marcadas ${p.clases} nem faltas neste período.`,

    alumnosTitulo: `${p.Alumnos.toUpperCase()} · UM POR LINHA`,
    columnasAlumnos: [
      p.Alumno, `${p.Paquete} ativo`, p.Materia, 'Usadas', 'Restam', 'Vence',
      `${p.Clases} dadas`, 'Faltas', 'Recebido', 'Deve hoje', `Última ${p.clase}`,
    ],
    alumnosNota: `«${p.Paquete} ativo», «Usadas», «Restam», «Vence» e «Deve hoje» são de hoje; `
      + `«${p.Clases} dadas», «Faltas» e «Recebido», do período.`,
    sinAlumnos: `Ainda não há ${p.alumnos} com ${p.paquetes}.`,

    cadaGasto: 'CADA DESPESA DO PERÍODO',
    columnasCadaGasto: ['Data', 'Descrição', 'Categoria', 'Forma de pagamento', 'Conta', 'Valor'],
    mercaderiaAparteTitulo: 'VOCÊ COMPROU MERCADORIA · À PARTE, NÃO DESCONTA EM «SOBROU»',
    columnasMercaderia: ['', 'Categoria', 'Total comprado', 'Lançamentos'],
    mercaderia: 'Mercadoria',
    mercaderiaAparteGastos: 'Não está na tabela de cima nem em «Despesas»: o que você vendeu já desconta o que custou '
      + '(«Custo do vendido», no Resumo). Cada compra está na lista de baixo.',

    progresoTitulo: 'PROGRESSO DOS SEUS CLIENTES NO PERÍODO',
    columnasProgreso: [
      'Cliente', 'Medidas', 'Peso inicial', 'Peso final', 'Mudança de peso',
      'Cintura inicial', 'Cintura final', 'Mudança de cintura',
      'Gordura inicial', 'Gordura final', 'Mudança de gordura', 'Método da gordura',
      'Última medida', 'Dias sem medir', 'Treino vigente',
    ],
    promedio: 'MÉDIA',
    progresoNota: 'Primeira contra última medida do período, de quem tem duas ou mais. '
      + 'A gordura só se compara se as duas foram medidas com o mesmo método. Peso em kg, cintura em cm, gordura em %.',
    sinRutina: 'sem treino',
    sinMedidas: 'Ainda não há clientes com um plano ativo nem medidas neste período.',
  };
}

/** Los textos del libro en el idioma de quien lo baja y con las palabras de su oficio. */
export function textosAlumnosExcel(idioma?: string, jerga?: Jerga | null): TextosAlumnos {
  const trainer = jerga === 'entrenamiento';
  if (idioma === 'pt') return pt(trainer ? TRAINER_PT : PROFE_PT);
  return es(trainer ? TRAINER_ES : PROFE_ES);
}

export type { TextosAlumnos };
