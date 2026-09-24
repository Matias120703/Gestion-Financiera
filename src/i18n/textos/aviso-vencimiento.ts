import type { TextosAvisoVencimiento } from '@/lib/aviso-vencimiento';

/**
 * TEXTOS DEL AVISO DE VENCIMIENTO DE LA SUSCRIPCIÓN (107).
 *
 * El diccionario lo incluye como `t.avisoVencimiento` (ver es.ts y pt.ts):
 * el aviso al que paga de que se le vence el período (3 días antes, 1 día
 * antes y el día), por push y por correo, y el correo del fin de la prueba
 * (el push de la prueba sigue siendo el de `notificaciones.prueba`, 071).
 *
 * Los arma `src/lib/aviso-vencimiento.ts`; la forma está definida allá para
 * que esa lógica se pruebe sin cargar los diccionarios.
 *
 * El precio es el de lista en guaraníes, sin promesas de descuento: el de
 * constancia (079, 093) se decide el día que paga, no tres días antes.
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
    asunto: (plan, cuando) => `Tu plan ${plan} de Orden vence ${cuando}`,
    frase: (plan, cuando) => `Tu plan ${plan} vence ${cuando}. Para seguir usando Orden sin cortes, renovalo antes de esa fecha.`,
    precio: (precio) => `Renovación: ${precio}.`,
    boton: 'Renovar mi plan',
    pie: 'Te escribimos porque administrás esta cuenta de Orden. Si ya pagaste, no hace falta que hagas nada.',
  },
  prueba: {
    asunto: (cuando) => `Tu prueba de Orden termina ${cuando}`,
    frase: (cuando) => `Tu prueba de Orden termina ${cuando}. Para seguir usando Orden, activá tu plan.`,
    precio: (plan, precio) => `Plan ${plan}: ${precio}.`,
    boton: 'Activar mi plan',
    pie: 'Te escribimos porque administrás esta cuenta de Orden y la prueba está por terminar.',
  },
  hola: (nombre) => (nombre.trim() ? `Hola ${nombre.trim()},` : 'Hola,'),
  guardado: 'Lo que cargaste queda guardado.',
  comoPagarTitulo: 'Cómo pagar',
  comoPagar: {
    transferencia: 'Entrá a Orden, andá a tu plan y tocá «Suscribirme»: se abre un WhatsApp con nosotros, transferís y te activamos el plan.',
    tarjeta: 'Entrá a Orden, andá a tu plan y pagá con tu tarjeta. Se activa en el momento.',
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
    asunto: (plan, cuando) => `Seu plano ${plan} do Orden vence ${cuando}`,
    frase: (plan, cuando) => `Seu plano ${plan} vence ${cuando}. Pra continuar usando o Orden sem interrupção, renove antes dessa data.`,
    precio: (precio) => `Renovação: ${precio}.`,
    boton: 'Renovar meu plano',
    pie: 'Escrevemos porque você administra esta conta do Orden. Se já pagou, não precisa fazer nada.',
  },
  prueba: {
    asunto: (cuando) => `Seu teste do Orden termina ${cuando}`,
    frase: (cuando) => `Seu teste do Orden termina ${cuando}. Pra continuar usando o Orden, ative seu plano.`,
    precio: (plan, precio) => `Plano ${plan}: ${precio}.`,
    boton: 'Ativar meu plano',
    pie: 'Escrevemos porque você administra esta conta do Orden e o teste está terminando.',
  },
  hola: (nombre) => (nombre.trim() ? `Olá ${nombre.trim()},` : 'Olá,'),
  guardado: 'O que você lançou fica guardado.',
  comoPagarTitulo: 'Como pagar',
  comoPagar: {
    transferencia: 'Entre no Orden, vá até seu plano e toque em «Assinar»: abre um WhatsApp com a gente, você transfere e ativamos o plano.',
    tarjeta: 'Entre no Orden, vá até seu plano e pague com seu cartão. Ativa na hora.',
  },
};
