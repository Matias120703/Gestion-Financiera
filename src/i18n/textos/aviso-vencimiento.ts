import type { TextosAvisoVencimiento } from '@/lib/aviso-vencimiento';

/**
 * TEXTOS DEL AVISO DE VENCIMIENTO DE LA SUSCRIPCIÓN (107).
 *
 * El diccionario lo incluye como `t.avisoVencimiento` (ver es.ts y pt.ts):
 * el aviso al que paga de que se le vence el período (3 días antes, 1 día
 * antes y el día), por push y por correo, y el correo del fin de la prueba
 * (el push de la prueba sigue siendo el de `notificaciones.prueba`, 071).
 *
 * Las claves `…Personal` son de la cuenta personal (110, 28/09/2026): no se
 * pausa, pasa al plan Gratis, y el aviso dice qué se cierra y que queda
 * guardado. Las de siempre siguen siendo del negocio.
 *
 * Los arma `src/lib/aviso-vencimiento.ts`; la forma está definida allá para
 * que esa lógica se pruebe sin cargar los diccionarios.
 *
 * El precio es el de lista en guaraníes, sin promesas de descuento: el de
 * constancia (079, 093) se decide el día que paga, no tres días antes.
 *
 * La prueba no tiene frase de débito (07/10/2026): una cuenta en prueba no
 * se cobra sola aunque haya guardado la tarjeta, así que su correo no
 * promete ningún cobro. `fraseDebito` y `comoPagar.debito` son solo del
 * plan pago.
 */
export const avisoVencimientoEs: TextosAvisoVencimiento = {
  planes: { basico: 'Básico', pro: 'Pro', negocio: 'Premium' },
  porMes: 'por mes',
  porAnio: 'por año',
  cuando: (dias, fecha) => (dias <= 0 ? `hoy, ${fecha}`
    : dias === 1 ? `mañana, ${fecha}`
    : `el ${fecha}`),
  periodo: {
    titulo: (dias) => (dias <= 0 ? 'Tu plan de Orden vence hoy'
      : dias === 1 ? 'Tu plan de Orden vence mañana'
      : `Tu plan de Orden vence en ${dias} días`),
    cuerpo: (plan, precio) => (precio
      ? `Plan ${plan}: ${precio}. Pagalo para seguir sin cortes; lo que cargaste queda guardado.`
      : `Pagá tu plan ${plan} para seguir sin cortes; lo que cargaste queda guardado.`),
    // La cuenta personal no se corta: pasa al plan Gratis (110, 28/09/2026).
    // El aviso dice qué se cierra ese día.
    // Lo que queda guardado es lo cargado, no «la voz» (28/09/2026).
    cuerpoPersonal: (plan, precio) => (precio
      ? `Plan ${plan}: ${precio}. Si no lo renovás, pasás al plan Gratis: se cierran la voz, tu presupuesto y tus deudas, y lo que cargaste queda guardado.`
      : `Si no renovás tu plan ${plan}, pasás al plan Gratis: se cierran la voz, tu presupuesto y tus deudas, y lo que cargaste queda guardado.`),
    asunto: (plan, cuando) => `Tu plan ${plan} de Orden vence ${cuando}`,
    frase: (plan, cuando) => `Tu plan ${plan} vence ${cuando}. Para seguir usando Orden sin cortes, renovalo antes de esa fecha.`,
    // Sin «ese día»: con `cuando` = «hoy, lunes 29…» sonaba raro.
    frasePersonal: (plan, cuando) => `Tu plan ${plan} vence ${cuando}. Si no lo renovás, pasás al plan Gratis: se cierran la voz, tu presupuesto, tus deudas y los reportes, y lo que cargaste queda guardado. Anotar tus gastos e ingresos a mano sigue gratis.`,
    // Con la tarjeta guardada (Bancard, 02/10/2026) no hay nada que renovar.
    fraseDebito: (plan, cuando) => `Tu plan ${plan} vence ${cuando}. Lo renovamos solos con la tarjeta que guardaste: no tenés que hacer nada.`,
    precio: (precio) => `Renovación: ${precio}.`,
    boton: 'Renovar mi plan',
    botonDebito: 'Ver mi plan',
    pie: 'Te escribimos porque administrás esta cuenta de Orden. Si ya pagaste, no hace falta que hagas nada.',
  },
  prueba: {
    asunto: (cuando) => `Tu prueba de Orden termina ${cuando}`,
    frase: (cuando) => `Tu prueba de Orden termina ${cuando}. Para seguir usando Orden, activá tu plan.`,
    frasePersonal: (cuando) => `Tu prueba de Orden termina ${cuando}. Después pasás al plan Gratis: seguís anotando tus gastos e ingresos a mano. La voz, la foto, el presupuesto, tus deudas, lo que te deben, tus cuentas y los reportes son del Pro: quedan guardados y vuelven cuando lo actives.`,
    precio: (plan, precio) => `Plan ${plan}: ${precio}.`,
    boton: 'Activar mi plan',
    pie: 'Te escribimos porque administrás esta cuenta de Orden y la prueba está por terminar.',
  },
  hola: (nombre) => (nombre.trim() ? `Hola ${nombre.trim()},` : 'Hola,'),
  guardado: 'Lo que cargaste queda guardado.',
  comoPagarTitulo: 'Cómo pagar',
  comoPagar: {
    transferencia: 'Entrá a Orden, andá a tu plan y tocá «Suscribirme»: se abre un WhatsApp con nosotros, transferís y te activamos el plan.',
    tarjeta: 'Entrá a Orden, andá a tu plan y pagá con tarjeta o QR. Se activa en el momento. Si preferís transferir, te atendemos por WhatsApp.',
    debito: (fecha, importe, tarjeta) => (importe
      ? `El ${fecha} cobramos ${importe} de tu ${tarjeta}. No tenés que hacer nada.`
      : `El ${fecha} cobramos tu plan de tu ${tarjeta}. No tenés que hacer nada.`),
  },
};

export const avisoVencimientoPt: TextosAvisoVencimiento = {
  planes: { basico: 'Básico', pro: 'Pro', negocio: 'Premium' },
  porMes: 'por mês',
  porAnio: 'por ano',
  cuando: (dias, fecha) => (dias <= 0 ? `hoje, ${fecha}`
    : dias === 1 ? `amanhã, ${fecha}`
    : `em ${fecha}`),
  periodo: {
    titulo: (dias) => (dias <= 0 ? 'Seu plano do Orden vence hoje'
      : dias === 1 ? 'Seu plano do Orden vence amanhã'
      : `Seu plano do Orden vence em ${dias} dias`),
    cuerpo: (plan, precio) => (precio
      ? `Plano ${plan}: ${precio}. Pague pra continuar sem interrupção; o que você lançou fica guardado.`
      : `Pague seu plano ${plan} pra continuar sem interrupção; o que você lançou fica guardado.`),
    cuerpoPersonal: (plan, precio) => (precio
      ? `Plano ${plan}: ${precio}. Se não renovar, você passa pro plano Grátis: a voz, o orçamento e as dívidas ficam fechados, e o que você lançou fica guardado.`
      : `Se não renovar seu plano ${plan}, você passa pro plano Grátis: a voz, o orçamento e as dívidas ficam fechados, e o que você lançou fica guardado.`),
    asunto: (plan, cuando) => `Seu plano ${plan} do Orden vence ${cuando}`,
    frase: (plan, cuando) => `Seu plano ${plan} vence ${cuando}. Pra continuar usando o Orden sem interrupção, renove antes dessa data.`,
    frasePersonal: (plan, cuando) => `Seu plano ${plan} vence ${cuando}. Se não renovar, você passa pro plano Grátis: a voz, o orçamento, as dívidas e os relatórios ficam fechados, e o que você lançou fica guardado. Lançar suas despesas e entradas na mão continua grátis.`,
    fraseDebito: (plan, cuando) => `Seu plano ${plan} vence ${cuando}. Renovamos sozinhos com o cartão que você salvou: não precisa fazer nada.`,
    precio: (precio) => `Renovação: ${precio}.`,
    boton: 'Renovar meu plano',
    botonDebito: 'Ver meu plano',
    pie: 'Escrevemos porque você administra esta conta do Orden. Se já pagou, não precisa fazer nada.',
  },
  prueba: {
    asunto: (cuando) => `Seu teste do Orden termina ${cuando}`,
    frase: (cuando) => `Seu teste do Orden termina ${cuando}. Pra continuar usando o Orden, ative seu plano.`,
    frasePersonal: (cuando) => `Seu teste do Orden termina ${cuando}. Depois você passa pro plano Grátis: continua lançando suas despesas e entradas na mão. A voz, a foto, o orçamento, suas dívidas, o que te devem, suas contas e os relatórios são do Pro: ficam guardados e voltam quando você ativar o Pro.`,
    precio: (plan, precio) => `Plano ${plan}: ${precio}.`,
    boton: 'Ativar meu plano',
    pie: 'Escrevemos porque você administra esta conta do Orden e o teste está terminando.',
  },
  hola: (nombre) => (nombre.trim() ? `Olá ${nombre.trim()},` : 'Olá,'),
  guardado: 'O que você lançou fica guardado.',
  comoPagarTitulo: 'Como pagar',
  comoPagar: {
    transferencia: 'Entre no Orden, vá até seu plano e toque em «Assinar»: abre um WhatsApp com a gente, você transfere e ativamos o plano.',
    tarjeta: 'Entre no Orden, vá até seu plano e pague com cartão ou QR. Ativa na hora. Se preferir transferir, atendemos você pelo WhatsApp.',
    debito: (fecha, importe, tarjeta) => (importe
      ? `Em ${fecha} cobramos ${importe} no seu ${tarjeta}. Você não precisa fazer nada.`
      : `Em ${fecha} cobramos seu plano no seu ${tarjeta}. Você não precisa fazer nada.`),
  },
};
