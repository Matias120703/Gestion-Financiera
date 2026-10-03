/**
 * LA ESCENA «RECOMENDAR» EN LA PORTADA (02/10/2026): tres viñetas —mandás tu
 * enlace por WhatsApp, el que entra paga su primer mes, la mitad va a tu
 * saldo— con el globo y la media plata que viajan de una a otra.
 *
 * Lo que la app ya dice NO se repite acá: la tarjeta «Tu enlace» (copiar,
 * mandar por WhatsApp, el mensaje ya escrito), el aviso del panel («Fulano
 * pagó su primer mes. Te tocan…») y el cuadro «Tu saldo» se leen de
 * `t.recomendar`, así la escena dice exactamente lo que dice la app en los
 * dos idiomas. Las condiciones enteras siguen en `t.portada.recomendarBajada`
 * y `recomendarLetraChica`. Acá vive solo lo propio de la escena: el título,
 * los nombres de ejemplo, los tres pasos y el resumen para el lector de
 * pantalla.
 *
 * Mismo patrón que vitrina.ts: `recomendarEs`, el tipo sale del español y el
 * portugués tiene que tener la misma forma. Sin importar nada en ejecución
 * (la prueba lo compila suelto). Sin `as const`.
 *
 * NINGÚN PRECIO ESCRITO: los importes llegan por props desde page.tsx (los
 * precios de lista de la base y su mitad) y se formatean con `precio()`.
 * El código es inventado pero tiene la forma real (letras y números en
 * mayúsculas); el amigo es la barbería de la vitrina, o «Caro» cuando el
 * plan elegido es el de la cuenta personal.
 */
export const recomendarEs = {
  etiqueta: 'Un extra',
  /** El título entero; `tituloResaltado` es la parte que va en verde y tiene que estar adentro, letra por letra. */
  titulo: 'Traé a alguien y llevate la mitad.',
  tituloResaltado: 'la mitad',
  apoyo: 'Si entra con tu enlace y paga su primer mes, la mitad del precio de su plan es tuya.',
  /** Rótulo visible y aria-label de los chips de plan. */
  conQuePlan: '¿Con qué plan entra?',
  vos: 'Vos',
  inicialVos: 'V',
  vosOtraVez: 'Vos, otra vez',
  amigo: { negocio: 'Barbería Don Ramón', inicial: 'DR', personal: 'Caro', inicialPersonal: 'C' },
  /** Ocho letras y números en mayúsculas, como los códigos reales. */
  codigo: 'AURORA26',
  /** La forma real del enlace de socio (lib/referido.ts). */
  enlace: (codigo: string) => `https://orden.com.py/?ref=${codigo}`,
  probando: (dias: number) => `Probando gratis · ${dias} días`,
  /** Cuando la escena no sabe cuántos días dura esa prueba (no inventa). */
  probandoSinDias: 'Probando gratis',
  masAdelante: 'Más adelante',
  pagoPrimerMes: 'Pagó su primer mes',
  plan: (nombre: string, importe: string) => `Plan ${nombre} · ${importe} por mes`,
  /** Si ningún plan trajo precio, las viñetas dicen esto en lugar del importe. */
  sinImporte: 'la mitad del precio de su plan',
  pasos: [
    { titulo: 'Compartís tu enlace', texto: 'Por WhatsApp, con el mensaje ya escrito. Cada cuenta tiene el suyo.' },
    { titulo: 'Paga su primer mes', texto: 'Mientras prueba no pasa nada. Cuenta cuando paga de verdad.' },
    { titulo: 'La mitad va a tu saldo', texto: 'La retirás a tu banco o tu billetera. Ponés los datos una vez.' },
  ],
  empezarPrueba: 'Empezar la prueba gratis',
  tuEnlaceAdentro: 'Tu enlace está adentro, en «Invitaciones».',
  /** El <details> con la bajada y la letra chica de siempre. */
  condiciones: 'Las condiciones, enteras',
  resumen: 'Tres cuadros con datos de ejemplo: mandás tu enlace por WhatsApp; Barbería Don Ramón entra, prueba gratis y más adelante paga su primer mes del plan Pro; y la mitad del precio de su plan aparece en tu saldo, con el aviso del panel.',
  /** Lo que anuncia aria-live al cambiar de chip. */
  cambiado: (nombre: string, mitad: string) => `Con el plan ${nombre} te llevás ${mitad}.`,
  pausar: 'Pausar',
  seguir: 'Seguir',
  verDeNuevo: 'Ver de nuevo',
};

export type TextosRecomendar = typeof recomendarEs;

export const recomendarPt: TextosRecomendar = {
  etiqueta: 'Um extra',
  titulo: 'Traga alguém e fique com a metade.',
  tituloResaltado: 'a metade',
  apoyo: 'Se a pessoa entrar com o seu link e pagar o primeiro mês, metade do preço do plano dela é sua.',
  conQuePlan: 'Com qual plano ela entra?',
  vos: 'Você',
  inicialVos: 'V',
  vosOtraVez: 'Você, de novo',
  amigo: { negocio: 'Barbearia Dom Ramón', inicial: 'DR', personal: 'Carol', inicialPersonal: 'C' },
  codigo: 'AURORA26',
  enlace: (codigo: string) => `https://orden.com.py/?ref=${codigo}`,
  probando: (dias: number) => `Testando grátis · ${dias} dias`,
  probandoSinDias: 'Testando grátis',
  masAdelante: 'Mais adiante',
  pagoPrimerMes: 'Pagou o primeiro mês',
  plan: (nombre: string, importe: string) => `Plano ${nombre} · ${importe} por mês`,
  sinImporte: 'metade do preço do plano dela',
  pasos: [
    { titulo: 'Você compartilha seu link', texto: 'Pelo WhatsApp, com a mensagem já pronta. Cada conta tem o seu.' },
    { titulo: 'Ela paga o primeiro mês', texto: 'Enquanto testa, nada acontece. Conta quando paga de verdade.' },
    { titulo: 'A metade vai pro seu saldo', texto: 'Você saca pro seu banco ou pra sua carteira digital. Coloca os dados uma vez só.' },
  ],
  empezarPrueba: 'Começar o teste grátis',
  tuEnlaceAdentro: 'Seu link está lá dentro, em «Convites».',
  condiciones: 'As condições, completas',
  resumen: 'Três quadros com dados de exemplo: você manda seu link pelo WhatsApp; a Barbearia Dom Ramón entra, testa grátis e mais adiante paga o primeiro mês do plano Pro; e metade do preço do plano dela aparece no seu saldo, com o aviso do painel.',
  cambiado: (nombre: string, mitad: string) => `Com o plano ${nombre} você fica com ${mitad}.`,
  pausar: 'Pausar',
  seguir: 'Continuar',
  verDeNuevo: 'Ver de novo',
};
