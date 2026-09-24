/**
 * TEXTOS DE LA VITRINA DE LA PORTADA (24/09): «Orden se transforma según lo
 * que hacés». Los usa `src/components/portada/ElegiTuRubro.tsx`, que recibe
 * el idioma y elige `vitrinaEs` o `vitrinaPt`. No se registran en es.ts ni en
 * pt.ts: son de una sola pieza de una sola página.
 *
 * NADA QUE NO SEA VERDAD. Cada beneficio y cada punto de un plan dice algo
 * que Orden hace hoy para ESE rubro (ver la auditoría del 24/09): el Básico de
 * un comercio no promete agenda, el de un profe habla de alumnos, el Excel es
 * «armado para lo tuyo» y no «de cinco hojas», y las deudas con vencimiento
 * no son exclusivas de Pro. Los números de las mini pantallas son de
 * ejemplo, y la pantalla lo dice («datos de ejemplo»); cierran entre sí
 * (lo vendido menos la mercadería y los gastos da lo que quedó, el costo por
 * hectárea da los kilos para cubrirlo, etc.).
 *
 * El archivo no importa nada más que tipos: la prueba (pruebas/vitrina.test.js)
 * lo compila suelto y revisa que cada rubro tenga sus tres beneficios y los
 * textos de sus planes en los dos idiomas.
 */
import type { ClaveVitrina, PlanVitrina } from '../../components/portada/vitrina-datos';

export interface TextosRubroVitrina {
  /** El chip. Corto: tiene que entrar en una fila en el celular. */
  chip: string;
  /** El titular del rubro, al lado del celular. */
  titulo: string;
  /** Tres beneficios, una línea cada uno, verdaderos para este rubro. */
  beneficios: [string, string, string];
}

export interface TextosPlanVitrina {
  para: string;
  puntos: string[];
}

/** Los textos de cada plan, rubro por rubro. Solo los planes que el rubro compra. */
export type PlanesDeLaVitrina = Record<ClaveVitrina, Partial<Record<PlanVitrina, TextosPlanVitrina>>>;

// ---------------------------------------------------------------------------
// ESPAÑOL
// ---------------------------------------------------------------------------

const rubrosEs: Record<ClaveVitrina, TextosRubroVitrina> = {
  comercio: {
    chip: 'Comercio',
    titulo: 'Cuánto te quedó hoy, sin hacer una sola cuenta',
    beneficios: [
      'Lo que te quedó de verdad: con el costo de la mercadería del día en que vendiste',
      'Stock que se descuenta solo, y el fiado con quién te debe y desde cuándo',
      'Tus vendedores cargan con su cuenta y no ven tus costos',
    ],
  },
  servicios: {
    chip: 'Servicios',
    titulo: 'La agenda del local, y cuánto le toca a cada uno',
    beneficios: [
      'Un link para que tus clientes reserven el turno solos',
      'Un toque para recordarle el turno por WhatsApp, desde el WhatsApp del local',
      'Cuánto le toca a cada profesional: comisión, alquiler de silla o sueldo',
    ],
  },
  clases: {
    chip: 'Clases',
    titulo: 'Tus clases, tus alumnos y quién te debe la cuota',
    beneficios: [
      'Cada alumno con sus días y su horario, y los choques a la vista antes de inscribir',
      'Quién te debe la cuota del mes y qué clase se dio',
      'Paquetes de clases: cuántas le quedan a cada uno',
    ],
  },
  entrenamiento: {
    chip: 'Personal trainer',
    titulo: 'La rutina, en el celular de tu cliente',
    beneficios: [
      'Rutinas con link: tu cliente las abre en el gimnasio, sin instalar nada',
      'Medidas, cargas y progreso de cada cliente, que ves solo vos',
      'Sus notas de salud y lesiones a la vista en cada sesión',
    ],
  },
  agricultura: {
    chip: 'Campo',
    titulo: 'Campaña por campaña, con lo que te costó la hectárea',
    beneficios: [
      'El costo por hectárea y cuántos kilos necesitás para cubrirlo',
      'La cosecha camión por camión y la liquidación del acopio, con sus descuentos',
      'En guaraníes o en dólares, y los insumos «a cosecha» quedan como deuda de la campaña',
    ],
  },
  ganaderia: {
    chip: 'Ganadería',
    titulo: 'Cuánto te dejó cada lote, por cabeza',
    beneficios: [
      'Cada lote junta lo que pusiste y lo que cobraste: el resultado de verdad',
      'El resultado por cabeza, para comparar una tropa con otra',
      'El panel te muestra lo que va del año, no el día: tu ciclo es el lote',
    ],
  },
  personal: {
    chip: 'Para vos',
    titulo: 'Cuánto podés gastar por día hasta tu próximo cobro',
    beneficios: [
      'Tu presupuesto va de cobro a cobro, no del 1 al 30',
      'Gastos fijos, metas de ahorro y lo que te deben, cada cosa en su lugar',
      'Tarjetas y préstamos: ves qué cuota vence y cuánto debés en total',
    ],
  },
};

const REPORTES_ES = 'Reportes y Excel armados para lo tuyo';

const planesEs: PlanesDeLaVitrina = {
  comercio: {
    basico: {
      para: 'Para el que atiende solo su negocio',
      puntos: [
        'Ventas con stock, gastos, fiado y deudas con sus vencimientos',
        'Una sola persona: vos',
        'Voz, foto y texto: 300 cargas por mes',
        REPORTES_ES,
      ],
    },
    pro: {
      para: 'Para el negocio con hasta 2 vendedores',
      puntos: [
        'Todo lo del Básico',
        'Vos y hasta 2 vendedores, cada uno con su cuenta',
        'Tus vendedores no ven tus costos',
        'Voz, foto y texto: 600 cargas por mes',
      ],
    },
    negocio: {
      para: 'Para el local con más gente cargando',
      puntos: [
        'Todo lo del Pro, con más vendedores: hasta 15 personas',
        'Voz, foto y texto: 3.000 cargas por mes',
        '¿Más de 15? Escribinos y lo ampliamos',
      ],
    },
  },
  servicios: {
    basico: {
      para: 'Para el que atiende solo',
      puntos: [
        'Agenda con link de reservas y recordatorio por WhatsApp',
        'Cobros, gastos y quién te debe',
        'Una sola persona: vos',
        'Voz, foto y texto: 300 cargas por mes',
      ],
    },
    pro: {
      para: 'Para el local con hasta 2 profesionales más',
      puntos: [
        'Todo lo del Básico',
        'Vos y hasta 2 profesionales, cada uno con su cuenta',
        'Cuánto le toca a cada uno: comisión, silla o sueldo',
        'Voz, foto y texto: 600 cargas por mes',
      ],
    },
    negocio: {
      para: 'Para el local con más sillas',
      puntos: [
        'Todo lo del Pro, con más profesionales: hasta 15 personas',
        'Voz, foto y texto: 3.000 cargas por mes',
        '¿Más de 15? Escribinos y lo ampliamos',
      ],
    },
  },
  clases: {
    basico: {
      para: 'Para el profe que da sus clases',
      puntos: [
        'Alumnos inscriptos con días, horario, período y precio',
        '¿Ya te pagó? Quién te debe y qué clase se dio',
        'Paquetes de clases y gastos, en el mismo lugar',
        'Voz, foto y texto: 300 cargas por mes',
        REPORTES_ES,
      ],
    },
  },
  entrenamiento: {
    basico: {
      para: 'Para el trainer que trabaja uno a uno',
      puntos: [
        'Rutinas con plantillas y link para cada cliente',
        'Medidas e historial de cargas, que ves solo vos',
        'Quién te debe el mes y qué sesión se dio',
        'Voz, foto y texto: 300 cargas por mes',
        REPORTES_ES,
      ],
    },
  },
  agricultura: {
    basico: {
      para: 'Para el productor que carga solo',
      puntos: [
        'Campañas con costo por hectárea, cosecha y liquidación',
        'En guaraníes o en dólares',
        'Una sola persona: vos',
        'Voz, foto y texto: 300 cargas por mes',
        REPORTES_ES,
      ],
    },
    pro: {
      para: 'Para cargar junto con tu encargado',
      puntos: [
        'Todo lo del Básico',
        'Vos y hasta 2 personas más, cada una con su cuenta',
        'El encargado carga la cosecha y no ve tus costos',
        'Voz, foto y texto: 600 cargas por mes',
      ],
    },
  },
  ganaderia: {
    basico: {
      para: 'Para el que lleva solo su campo',
      puntos: [
        'Lotes con lo que pusiste, lo que cobraste y el resultado',
        'Resultado por cabeza y lo que va del año',
        'Una sola persona: vos',
        'Voz, foto y texto: 300 cargas por mes',
        REPORTES_ES,
      ],
    },
    pro: {
      para: 'Para el campo con hasta 2 personas más',
      puntos: [
        'Todo lo del Básico',
        'Vos y hasta 2 personas más, cada una con su cuenta',
        'Los costos y las deudas los ve solo administración',
        'Voz, foto y texto: 600 cargas por mes',
      ],
    },
  },
  personal: {
    pro: {
      para: 'Un solo plan, sin versiones',
      puntos: [
        'Presupuesto de cobro a cobro y cuánto podés gastar por día',
        'Gastos fijos, ahorros y metas con fecha',
        'Tarjetas, préstamos y qué cuota vence esta semana',
        'Voz, foto y texto: 600 cargas por mes',
        REPORTES_ES,
      ],
    },
  },
};

export const vitrinaEs = {
  pregunta: '¿A qué te dedicás?',
  /** Lo que se anuncia al cambiar de chip (aria-live). */
  mostrando: (rubro: string) => `Mostrando Orden para: ${rubro}`,
  datosDeEjemplo: 'Pantalla de Orden con datos de ejemplo',

  rubros: rubrosEs,

  probar: (dias: number) => `Probar ${dias} días gratis`,
  garantias: 'Sin tarjeta · Tus datos no se borran',

  // ---- los planes ----
  cuantoCuesta: (rubro: string) => `Cuánto cuesta · ${rubro}`,
  nombresPlan: { basico: 'Básico', pro: 'Pro', negocio: 'Premium' } as Record<PlanVitrina, string>,
  nombrePersonal: 'Personal',
  porMes: '/ mes',
  desde: 'desde',
  referencia: (monto: string) => `≈ ${monto}`,
  referenciaAyuda: 'Referencia en dólares. No se cobra en dólares.',
  alAnio: (monto: string, meses: number) => `O ${monto} al año: ${meses} ${meses === 1 ? 'mes' : 'meses'} de regalo.`,
  vendedorExtra: (monto: string) => `Cada vendedor o profesional arriba de los 2 del Pro suma ${monto} al mes. Escribinos y te pasamos el número exacto.`,
  conEsteProbas: 'Tu prueba es con este',
  planes: planesEs,
  /** Si algún día la página manda un plan que acá no tiene texto propio. */
  planGenerico: {
    basico: { para: 'Para una sola persona', puntos: ['Voz, foto y texto: 300 cargas por mes', REPORTES_ES] },
    pro: { para: 'Para vos y hasta 2 personas más', puntos: ['Voz, foto y texto: 600 cargas por mes', REPORTES_ES] },
    negocio: { para: 'Para hasta 15 personas', puntos: ['Voz, foto y texto: 3.000 cargas por mes', REPORTES_ES] },
  } as Record<PlanVitrina, TextosPlanVitrina>,

  // ---- la letra de los precios, sin letra chica ----
  loQueTenesQueSaber: 'Lo que tenés que saber',
  cobroEnGuaranies: 'Se cobra en guaraníes. Si tu tarjeta es de otro país, tu banco lo convierte.',
  descuento: (pct: number, dias: number) =>
    `Ganate ${pct} % en tu primer mes: durante la prueba, cargá algo ${dias} días seguidos.`,
  constancia: (pct: number, dias: number) =>
    `Después, con ${dias} días seguidos cargando, pagás ${pct} % menos en cada renovación.`,
  comoSePaga: 'Hoy se paga por transferencia: al terminar la prueba tocás «Suscribirme», se abre un WhatsApp con nosotros, transferís y activamos tu plan.',
  finDePrueba: 'Si no pagás, la cuenta se pausa y no se puede usar hasta que actives el plan. Tus datos no se borran: vuelven intactos cuando pagás.',
  equipoNoPaga: 'Las personas que sumás no pagan nada: la suscripción la paga solo el dueño.',

  // ---- la barra de abajo del celular (la de verdad, rubro por rubro) ----
  barra: {
    panel: 'Panel', vender: 'Vender', cobrar: 'Cobrar', gastos: 'Gastos', cierre: 'Cierre',
    agenda: 'Agenda', alumnos: 'Alumnos', campanas: 'Campañas', deudas: 'Deudas',
    presupuesto: 'Presupuesto', mas: 'Más',
  },
  hoy: 'Hoy',

  // ---- las mini pantallas ----
  pantallas: {
    comercio: {
      resumen: 'Así ve su panel un comercio: te quedó hoy Gs. 2.150.000, 18 % más que el martes pasado. La venta se cargó hablando y el stock se descontó solo.',
      negocio: 'Perfumería Aurora',
      teQuedoHoy: 'Te quedó hoy',
      monto: 'Gs. 2.150.000',
      variacion: '↑ 18 %',
      comparado: 'que el martes pasado',
      filas: [
        { etiqueta: 'Vendido', valor: '2.600.000', tono: 'bueno' },
        { etiqueta: 'Mercadería', valor: '− 300.000', tono: 'malo' },
        { etiqueta: 'Gastos', valor: '− 150.000', tono: 'malo' },
      ],
      loCargasteAsi: 'Lo cargaste así',
      dictado: '«Vendí dos perfumes a 150 mil»',
      cargado: 'Cargado · stock descontado',
      porAcabarse: 'Por acabarse',
      stock: ['Aurora 50 ml · quedan 3', 'Brisa 100 ml · quedan 2'],
    },
    servicios: {
      resumen: 'Así ve la agenda una barbería: los turnos del día con su profesional, uno reservado por el link, y lo que le debés a Luis del reparto: Gs. 180.000.',
      negocio: 'Barbería Don Ramón',
      agenda: 'Agenda',
      vistas: ['Día', 'Semana', 'Mes'],
      turnos: [
        { hora: '09:00', cliente: 'Diego', servicio: 'Corte y barba · con Luis', estado: 'cobrado' },
        { hora: '10:30', cliente: 'Fabián', servicio: 'Corte · con Mati', estado: 'link' },
        { hora: '11:15', cliente: 'Hugo', servicio: 'Barba · con Luis', estado: 'recordar' },
      ],
      cobrado: 'Cobrado',
      porElLink: 'Reservó por el link',
      recordar: 'Recordarle',
      reparto: 'Cuánto le toca a cada uno',
      personas: [
        { nombre: 'Luis', detalle: 'Comisión 50 %', valor: 'Le debés Gs. 180.000', debe: true },
        { nombre: 'Mati', detalle: 'Alquila la silla', valor: 'al día', debe: false },
      ],
    },
    clases: {
      resumen: 'Así ve su panel un profe: las clases de hoy (17:00 Sofía, 18:30 Mateo), Gs. 450.000 por cobrar de 3 alumnos, y a Juan le quedan 2 clases de su paquete.',
      negocio: 'Prof. Laura · Inglés',
      clasesDeHoy: 'Tus clases de hoy',
      verAgenda: 'Ver la agenda',
      clases: [
        { hora: '15:30', alumno: 'Juan', materia: 'Inglés A2', dada: true },
        { hora: '17:00', alumno: 'Sofía', materia: 'Inglés B1', dada: false },
        { hora: '18:30', alumno: 'Mateo', materia: 'Inglés para el examen', dada: false },
      ],
      claseDada: 'Clase dada',
      cobrado: 'Cobrado',
      cobradoMonto: 'Gs. 1,8 M',
      clasesDadas: '12 clases dadas',
      porCobrar: 'Por cobrar',
      porCobrarMonto: 'Gs. 450 mil',
      teDeben: '3 alumnos te deben',
      paquete: 'Paquete de Juan',
      quedan: 'quedan 2',
      usadas: '6 de 8 clases usadas',
    },
    entrenamiento: {
      resumen: 'Así ve su rutina el cliente de un trainer, desde el link: Día A, piernas; sentadilla 4 × 8-10 con 40 kg, ya hecha. En la ficha, que ve solo el trainer: peso −4,1 kg desde julio.',
      estudio: 'Tu rutina · Estudio Fuerza',
      hola: 'Hola, Caro',
      fechas: 'Desde el 01/09 · actualizada el 20/09',
      dias: ['Día A · Piernas', 'Día B · Espalda', 'Día C'],
      hechos: '1 de 4 hechos hoy',
      ejercicios: [
        { numero: '1', nombre: 'Sentadilla', series: '4 × 8-10', carga: '40 kg', descanso: '90 s', hecho: true },
        { numero: '2', nombre: 'Peso muerto rumano', series: '3 × 10', carga: '30 kg', descanso: '60 s', hecho: false },
      ],
      carga: 'Carga',
      descanso: 'Descanso',
      hecho: 'Hecho',
      marcarHecho: 'Marcar como hecho',
      pie: 'Rutinas con Orden',
      fichaTitulo: 'La ficha de Caro · la ves solo vos',
      fichaDato: 'Peso −4,1 kg desde julio',
    },
    agricultura: {
      resumen: 'Así ve una campaña un productor: Norte, soja, zafra 2025/26, 50 hectáreas. Costo US$ 308 por hectárea; para cubrirlo necesitás 742 kg/ha a US$ 415 la tonelada; 30.000 kg en el silo sin vender.',
      negocio: 'Agro Santa Rosa',
      moneda: 'US$',
      campanas: 'Campañas',
      nombre: 'Norte',
      detalle: 'Soja · Zafra 2025/26 · 50 ha',
      resultado: 'US$ 34.400',
      resultadoHa: 'US$ 688/ha',
      filas: [
        { titulo: 'Costo', valor: 'US$ 15.400', extra: '(US$ 308/ha)', nota: '', tono: '' },
        { titulo: 'Cobrado', valor: 'US$ 49.800', extra: '', nota: '120.000 kg vendidos a US$ 415/t promedio', tono: '' },
        { titulo: 'Resultado', valor: 'US$ 34.400', extra: '(US$ 688/ha)', nota: '', tono: 'bueno' },
        { titulo: 'Cosechado', valor: '150.000 kg', extra: '', nota: '3.000 kg/ha (50 sc/ha) · te salió US$ 103 la tonelada', tono: '' },
      ],
      cubrir: 'Para cubrir el costo necesitás 742 kg/ha (12,4 sc/ha) a US$ 415/t · Ya cubriste el costo.',
      silo: '30.000 kg en el silo, sin vender',
      cosecha: 'Cosecha',
      liquidacion: 'Liquidación',
    },
    ganaderia: {
      resumen: 'Así ve sus lotes un ganadero: Novillos corral 3, 40 cabezas, resultado Gs. 47.200.000, o sea Gs. 1.180.000 por cabeza.',
      negocio: 'Estancia La Paloma',
      lotes: 'Lotes',
      explicacion: 'Resultado: lo que cobraste menos lo que pusiste.',
      cerrado: 'Cerrado',
      lista: [
        {
          nombre: 'Novillos corral 3', detalle: '40 cabezas · duró 96 días',
          resultado: 'Gs. 47.200.000', porCabeza: 'Gs. 1.180.000 por cabeza',
          puesto: 'Gs. 152.800.000', cobrado: 'Gs. 200.000.000',
        },
        {
          nombre: 'Vaquillas potrero 2', detalle: '25 cabezas · duró 120 días',
          resultado: 'Gs. 21.250.000', porCabeza: 'Gs. 850.000 por cabeza',
          puesto: 'Gs. 98.750.000', cobrado: 'Gs. 120.000.000',
        },
      ],
      puesto: 'Puesto',
      cobrado: 'Cobrado',
    },
    personal: {
      resumen: 'Así ve su presupuesto una persona: te quedan Gs. 1.240.000 hasta el 5, Gs. 41.000 por día, y la cuota de la tarjeta vence el 12.',
      negocio: 'Mis finanzas',
      titulo: 'Presupuesto y ahorro',
      disponible: 'Disponible',
      monto: 'Gs. 1.240.000',
      hasta: 'hasta el 5, tu próxima fecha de cobro',
      porDia: 'Gs. 41.000 por día',
      paraDias: 'para los 30 días restantes',
      detalle: 'Detalle del cálculo',
      filas: [
        { etiqueta: 'Ingresos del período', valor: '4.800.000', tono: 'bueno' },
        { etiqueta: 'Gastos registrados', valor: '− 260.000', tono: 'malo' },
        { etiqueta: 'Gastos fijos pendientes', valor: '− 2.300.000', tono: 'malo' },
        { etiqueta: 'Cuotas de deuda a vencer', valor: '− 1.000.000', tono: 'malo' },
      ],
      cuota: 'Tarjeta · cuota 4 de 12',
      vence: 'vence el 12',
      cuotaMonto: 'Gs. 450.000',
    },
  },
};

export type TextosVitrina = typeof vitrinaEs;

// ---------------------------------------------------------------------------
// PORTUGUÊS (do Brasil, com a fala de cada ofício)
// ---------------------------------------------------------------------------

const rubrosPt: Record<ClaveVitrina, TextosRubroVitrina> = {
  comercio: {
    chip: 'Comércio',
    titulo: 'Quanto sobrou hoje, sem fazer uma conta',
    beneficios: [
      'O que sobrou de verdade: com o custo da mercadoria do dia em que você vendeu',
      'Estoque que baixa sozinho, e o fiado com quem te deve e desde quando',
      'Seus vendedores lançam com a própria conta e não veem seus custos',
    ],
  },
  servicios: {
    chip: 'Serviços',
    titulo: 'A agenda do salão, e quanto cabe a cada um',
    beneficios: [
      'Um link pros seus clientes marcarem horário sozinhos',
      'Um toque pra lembrar o cliente pelo WhatsApp, do WhatsApp do salão',
      'Quanto cabe a cada profissional: comissão, aluguel de cadeira ou salário',
    ],
  },
  clases: {
    chip: 'Aulas',
    titulo: 'Suas aulas, seus alunos e quem te deve a mensalidade',
    beneficios: [
      'Cada aluno com seus dias e horário, e os choques à vista antes de matricular',
      'Quem te deve a mensalidade e qual aula foi dada',
      'Pacotes de aulas: quantas restam pra cada um',
    ],
  },
  entrenamiento: {
    chip: 'Personal trainer',
    titulo: 'O treino, no celular do seu aluno',
    beneficios: [
      'Treinos com link: seu cliente abre na academia, sem instalar nada',
      'Medidas, cargas e evolução de cada cliente, que só você vê',
      'As notas de saúde e lesões à vista em cada sessão',
    ],
  },
  agricultura: {
    chip: 'Lavoura',
    titulo: 'Safra por safra, com quanto custou o hectare',
    beneficios: [
      'O custo por hectare e quantos quilos você precisa pra cobrir',
      'A colheita caminhão por caminhão e a liquidação do armazém, com os descontos',
      'Em guaranis ou em dólares, e os insumos «na colheita» ficam como dívida da safra',
    ],
  },
  ganaderia: {
    chip: 'Pecuária',
    titulo: 'Quanto cada lote deixou, por cabeça',
    beneficios: [
      'Cada lote junta o que você investiu e o que recebeu: o resultado de verdade',
      'O resultado por cabeça, pra comparar um lote com outro',
      'O painel mostra o ano até agora, não o dia: seu ciclo é o lote',
    ],
  },
  personal: {
    chip: 'Pra você',
    titulo: 'Quanto você pode gastar por dia até o próximo pagamento',
    beneficios: [
      'Seu orçamento vai de pagamento a pagamento, não do dia 1 ao 30',
      'Gastos fixos, metas de reserva e o que te devem, cada coisa no seu lugar',
      'Cartões e empréstimos: você vê qual parcela vence e quanto deve no total',
    ],
  },
};

const REPORTES_PT = 'Relatórios e Excel feitos pro seu ramo';

const planesPt: PlanesDeLaVitrina = {
  comercio: {
    basico: {
      para: 'Para quem toca o negócio sozinho',
      puntos: [
        'Vendas com estoque, despesas, fiado e dívidas com vencimentos',
        'Uma só pessoa: você',
        'Voz, foto e texto: 300 lançamentos por mês',
        REPORTES_PT,
      ],
    },
    pro: {
      para: 'Pro negócio com até 2 vendedores',
      puntos: [
        'Tudo do Básico',
        'Você e até 2 vendedores, cada um com sua conta',
        'Seus vendedores não veem seus custos',
        'Voz, foto e texto: 600 lançamentos por mês',
      ],
    },
    negocio: {
      para: 'Pro local com mais gente lançando',
      puntos: [
        'Tudo do Pro, com mais vendedores: até 15 pessoas',
        'Voz, foto e texto: 3.000 lançamentos por mês',
        'Mais de 15? Fale com a gente e ampliamos',
      ],
    },
  },
  servicios: {
    basico: {
      para: 'Para quem atende sozinho',
      puntos: [
        'Agenda com link de reservas e lembrete pelo WhatsApp',
        'Recebimentos, despesas e quem te deve',
        'Uma só pessoa: você',
        'Voz, foto e texto: 300 lançamentos por mês',
      ],
    },
    pro: {
      para: 'Pro salão com até 2 profissionais a mais',
      puntos: [
        'Tudo do Básico',
        'Você e até 2 profissionais, cada um com sua conta',
        'Quanto cabe a cada um: comissão, cadeira ou salário',
        'Voz, foto e texto: 600 lançamentos por mês',
      ],
    },
    negocio: {
      para: 'Pro salão com mais cadeiras',
      puntos: [
        'Tudo do Pro, com mais profissionais: até 15 pessoas',
        'Voz, foto e texto: 3.000 lançamentos por mês',
        'Mais de 15? Fale com a gente e ampliamos',
      ],
    },
  },
  clases: {
    basico: {
      para: 'Para o professor que dá suas aulas',
      puntos: [
        'Alunos matriculados com dias, horário, período e preço',
        'Já te pagou? Quem te deve e qual aula foi dada',
        'Pacotes de aulas e despesas, no mesmo lugar',
        'Voz, foto e texto: 300 lançamentos por mês',
        REPORTES_PT,
      ],
    },
  },
  entrenamiento: {
    basico: {
      para: 'Para o trainer que trabalha um a um',
      puntos: [
        'Treinos com modelos e link pra cada cliente',
        'Medidas e histórico de cargas, que só você vê',
        'Quem te deve o mês e qual sessão foi dada',
        'Voz, foto e texto: 300 lançamentos por mês',
        REPORTES_PT,
      ],
    },
  },
  agricultura: {
    basico: {
      para: 'Para o produtor que lança sozinho',
      puntos: [
        'Safras com custo por hectare, colheita e liquidação',
        'Em guaranis ou em dólares',
        'Uma só pessoa: você',
        'Voz, foto e texto: 300 lançamentos por mês',
        REPORTES_PT,
      ],
    },
    pro: {
      para: 'Pra lançar junto com seu encarregado',
      puntos: [
        'Tudo do Básico',
        'Você e até 2 pessoas a mais, cada uma com sua conta',
        'O encarregado lança a colheita e não vê seus custos',
        'Voz, foto e texto: 600 lançamentos por mês',
      ],
    },
  },
  ganaderia: {
    basico: {
      para: 'Para quem cuida sozinho da fazenda',
      puntos: [
        'Lotes com o que você investiu, o que recebeu e o resultado',
        'Resultado por cabeça e o ano até agora',
        'Uma só pessoa: você',
        'Voz, foto e texto: 300 lançamentos por mês',
        REPORTES_PT,
      ],
    },
    pro: {
      para: 'Pra fazenda com até 2 pessoas a mais',
      puntos: [
        'Tudo do Básico',
        'Você e até 2 pessoas a mais, cada uma com sua conta',
        'Custos e dívidas só a administração vê',
        'Voz, foto e texto: 600 lançamentos por mês',
      ],
    },
  },
  personal: {
    pro: {
      para: 'Um plano só, sem versões',
      puntos: [
        'Orçamento de pagamento a pagamento e quanto dá pra gastar por dia',
        'Gastos fixos, reservas e metas com data',
        'Cartões, empréstimos e qual parcela vence esta semana',
        'Voz, foto e texto: 600 lançamentos por mês',
        REPORTES_PT,
      ],
    },
  },
};

export const vitrinaPt: TextosVitrina = {
  pregunta: 'Com o que você trabalha?',
  mostrando: (rubro: string) => `Mostrando o Orden para: ${rubro}`,
  datosDeEjemplo: 'Tela do Orden com dados de exemplo',

  rubros: rubrosPt,

  probar: (dias: number) => `Testar ${dias} dias grátis`,
  garantias: 'Sem cartão · Seus dados não são apagados',

  cuantoCuesta: (rubro: string) => `Quanto custa · ${rubro}`,
  nombresPlan: { basico: 'Básico', pro: 'Pro', negocio: 'Premium' },
  nombrePersonal: 'Pessoal',
  porMes: '/ mês',
  desde: 'a partir de',
  referencia: (monto: string) => `≈ ${monto}`,
  referenciaAyuda: 'Referência em dólares. Não é cobrado em dólares.',
  alAnio: (monto: string, meses: number) => `Ou ${monto} por ano: ${meses} ${meses === 1 ? 'mês' : 'meses'} de presente.`,
  vendedorExtra: (monto: string) => `Cada vendedor ou profissional além dos 2 do Pro soma ${monto} por mês. Fale com a gente e passamos o valor exato.`,
  conEsteProbas: 'Seu teste é com este',
  planes: planesPt,
  planGenerico: {
    basico: { para: 'Para uma pessoa só', puntos: ['Voz, foto e texto: 300 lançamentos por mês', REPORTES_PT] },
    pro: { para: 'Pra você e até 2 pessoas a mais', puntos: ['Voz, foto e texto: 600 lançamentos por mês', REPORTES_PT] },
    negocio: { para: 'Para até 15 pessoas', puntos: ['Voz, foto e texto: 3.000 lançamentos por mês', REPORTES_PT] },
  },

  loQueTenesQueSaber: 'O que você precisa saber',
  cobroEnGuaranies: 'Cobrado em guaranis. Se o seu cartão for de outro país, o seu banco faz a conversão.',
  descuento: (pct: number, dias: number) =>
    `Ganhe ${pct} % no primeiro mês: durante o teste, lance algo ${dias} dias seguidos.`,
  constancia: (pct: number, dias: number) =>
    `Depois, com ${dias} dias seguidos lançando, você paga ${pct} % menos em cada renovação.`,
  comoSePaga: 'Hoje se paga por transferência: no fim do teste você toca em «Assinar», abre um WhatsApp com a gente, transfere e ativamos seu plano.',
  finDePrueba: 'Se você não pagar, a conta fica pausada e não dá pra usar até ativar o plano. Seus dados não são apagados: voltam intactos quando você paga.',
  equipoNoPaga: 'As pessoas que você adiciona não pagam nada: a assinatura é paga só pelo dono.',

  barra: {
    panel: 'Painel', vender: 'Vender', cobrar: 'Receber', gastos: 'Despesas', cierre: 'Fechamento',
    agenda: 'Agenda', alumnos: 'Alunos', campanas: 'Safras', deudas: 'Dívidas',
    presupuesto: 'Orçamento', mas: 'Mais',
  },
  hoy: 'Hoje',

  pantallas: {
    comercio: {
      resumen: 'Assim um comércio vê o painel: sobrou hoje Gs. 2.150.000, 18 % a mais que na terça passada. A venda foi lançada falando e o estoque baixou sozinho.',
      negocio: 'Perfumaria Aurora',
      teQuedoHoy: 'Sobrou hoje',
      monto: 'Gs. 2.150.000',
      variacion: '↑ 18 %',
      comparado: 'que na terça passada',
      filas: [
        { etiqueta: 'Vendido', valor: '2.600.000', tono: 'bueno' },
        { etiqueta: 'Mercadoria', valor: '− 300.000', tono: 'malo' },
        { etiqueta: 'Despesas', valor: '− 150.000', tono: 'malo' },
      ],
      loCargasteAsi: 'Você lançou assim',
      dictado: '«Vendi dois perfumes a 150 mil»',
      cargado: 'Lançado · estoque baixado',
      porAcabarse: 'Acabando',
      stock: ['Aurora 50 ml · restam 3', 'Brisa 100 ml · restam 2'],
    },
    servicios: {
      resumen: 'Assim uma barbearia vê a agenda: os horários do dia com seu profissional, um marcado pelo link, e o que você deve ao Luis da divisão: Gs. 180.000.',
      negocio: 'Barbearia Dom Ramón',
      agenda: 'Agenda',
      vistas: ['Dia', 'Semana', 'Mês'],
      turnos: [
        { hora: '09:00', cliente: 'Diego', servicio: 'Corte e barba · com Luis', estado: 'cobrado' },
        { hora: '10:30', cliente: 'Fabián', servicio: 'Corte · com Mati', estado: 'link' },
        { hora: '11:15', cliente: 'Hugo', servicio: 'Barba · com Luis', estado: 'recordar' },
      ],
      cobrado: 'Recebido',
      porElLink: 'Marcou pelo link',
      recordar: 'Lembrar',
      reparto: 'Quanto cabe a cada um',
      personas: [
        { nombre: 'Luis', detalle: 'Comissão 50 %', valor: 'Você deve Gs. 180.000', debe: true },
        { nombre: 'Mati', detalle: 'Aluga a cadeira', valor: 'em dia', debe: false },
      ],
    },
    clases: {
      resumen: 'Assim um professor vê o painel: as aulas de hoje (17:00 Sofía, 18:30 Mateo), Gs. 450.000 a receber de 3 alunos, e o Juan tem 2 aulas restantes no pacote.',
      negocio: 'Prof. Laura · Inglês',
      clasesDeHoy: 'Suas aulas de hoje',
      verAgenda: 'Ver a agenda',
      clases: [
        { hora: '15:30', alumno: 'Juan', materia: 'Inglês A2', dada: true },
        { hora: '17:00', alumno: 'Sofía', materia: 'Inglês B1', dada: false },
        { hora: '18:30', alumno: 'Mateo', materia: 'Inglês pra prova', dada: false },
      ],
      claseDada: 'Aula dada',
      cobrado: 'Recebido',
      cobradoMonto: 'Gs. 1,8 M',
      clasesDadas: '12 aulas dadas',
      porCobrar: 'A receber',
      porCobrarMonto: 'Gs. 450 mil',
      teDeben: '3 alunos te devem',
      paquete: 'Pacote do Juan',
      quedan: 'restam 2',
      usadas: '6 de 8 aulas usadas',
    },
    entrenamiento: {
      resumen: 'Assim o cliente de um trainer vê o treino, pelo link: Dia A, pernas; agachamento 4 × 8-10 com 40 kg, já feito. Na ficha, que só o trainer vê: peso −4,1 kg desde julho.',
      estudio: 'Seu treino · Estúdio Força',
      hola: 'Olá, Carol',
      fechas: 'Desde 01/09 · atualizado em 20/09',
      dias: ['Dia A · Pernas', 'Dia B · Costas', 'Dia C'],
      hechos: '1 de 4 feitos hoje',
      ejercicios: [
        { numero: '1', nombre: 'Agachamento', series: '4 × 8-10', carga: '40 kg', descanso: '90 s', hecho: true },
        { numero: '2', nombre: 'Stiff', series: '3 × 10', carga: '30 kg', descanso: '60 s', hecho: false },
      ],
      carga: 'Carga',
      descanso: 'Descanso',
      hecho: 'Feito',
      marcarHecho: 'Marcar como feito',
      pie: 'Treinos com Orden',
      fichaTitulo: 'A ficha da Carol · só você vê',
      fichaDato: 'Peso −4,1 kg desde julho',
    },
    agricultura: {
      resumen: 'Assim um produtor vê uma safra: Norte, soja, safra 25/26, 50 hectares. Custo US$ 308 por hectare; pra cobrir você precisa de 742 kg/ha a US$ 415 a tonelada; 30.000 kg no silo a vender.',
      negocio: 'Fazenda Santa Rosa',
      moneda: 'US$',
      campanas: 'Safras',
      nombre: 'Norte',
      detalle: 'Soja · Safra 25/26 · 50 ha',
      resultado: 'US$ 34.400',
      resultadoHa: 'US$ 688/ha',
      filas: [
        { titulo: 'Custo', valor: 'US$ 15.400', extra: '(US$ 308/ha)', nota: '', tono: '' },
        { titulo: 'Recebido', valor: 'US$ 49.800', extra: '', nota: '120.000 kg vendidos a US$ 415/t em média', tono: '' },
        { titulo: 'Resultado', valor: 'US$ 34.400', extra: '(US$ 688/ha)', nota: '', tono: 'bueno' },
        { titulo: 'Colhido', valor: '150.000 kg', extra: '', nota: '3.000 kg/ha (50 sc/ha) · a tonelada saiu por US$ 103', tono: '' },
      ],
      cubrir: 'Pra cobrir o custo você precisa de 742 kg/ha (12,4 sc/ha) a US$ 415/t · Você já cobriu o custo.',
      silo: '30.000 kg no silo, a vender',
      cosecha: 'Colheita',
      liquidacion: 'Liquidação',
    },
    ganaderia: {
      resumen: 'Assim um pecuarista vê seus lotes: Novilhos curral 3, 40 cabeças, resultado Gs. 47.200.000, ou seja Gs. 1.180.000 por cabeça.',
      negocio: 'Estância La Paloma',
      lotes: 'Lotes',
      explicacion: 'Resultado: o que você recebeu menos o que investiu.',
      cerrado: 'Fechado',
      lista: [
        {
          nombre: 'Novilhos curral 3', detalle: '40 cabeças · durou 96 dias',
          resultado: 'Gs. 47.200.000', porCabeza: 'Gs. 1.180.000 por cabeça',
          puesto: 'Gs. 152.800.000', cobrado: 'Gs. 200.000.000',
        },
        {
          nombre: 'Novilhas piquete 2', detalle: '25 cabeças · durou 120 dias',
          resultado: 'Gs. 21.250.000', porCabeza: 'Gs. 850.000 por cabeça',
          puesto: 'Gs. 98.750.000', cobrado: 'Gs. 120.000.000',
        },
      ],
      puesto: 'Investido',
      cobrado: 'Recebido',
    },
    personal: {
      resumen: 'Assim uma pessoa vê o orçamento: sobram Gs. 1.240.000 até o dia 5, Gs. 41.000 por dia, e a parcela do cartão vence no dia 12.',
      negocio: 'Minhas finanças',
      titulo: 'Orçamento e reserva',
      disponible: 'Disponível',
      monto: 'Gs. 1.240.000',
      hasta: 'até o dia 5, seu próximo pagamento',
      porDia: 'Gs. 41.000 por dia',
      paraDias: 'para os 30 dias restantes',
      detalle: 'Detalhe do cálculo',
      filas: [
        { etiqueta: 'Entradas do período', valor: '4.800.000', tono: 'bueno' },
        { etiqueta: 'Despesas lançadas', valor: '− 260.000', tono: 'malo' },
        { etiqueta: 'Gastos fixos pendentes', valor: '− 2.300.000', tono: 'malo' },
        { etiqueta: 'Parcelas de dívida a vencer', valor: '− 1.000.000', tono: 'malo' },
      ],
      cuota: 'Cartão · parcela 4 de 12',
      vence: 'vence dia 12',
      cuotaMonto: 'Gs. 450.000',
    },
  },
};
