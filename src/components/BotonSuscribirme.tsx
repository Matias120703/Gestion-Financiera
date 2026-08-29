'use client';

/**
 * Suscribirse es abrir un WhatsApp, no cargar una tarjeta.
 *
 * En Paraguay, entre pedirle a un comerciante que ponga los datos de su
 * tarjeta en un formulario de un sistema que recién conoce, y que le escriba
 * a una persona para arreglar una transferencia, lo segundo cierra muchas
 * más ventas. No es una limitación técnica: es cómo se hacen los negocios.
 *
 * El mensaje va escrito de antemano con el negocio, el plan y el precio.
 * Importa: sin eso, del otro lado llegan diez «hola» sueltos por día y hay
 * que preguntar todo de nuevo, con lo que cada suscripción tarda dos días en
 * vez de diez minutos.
 *
 * Si no hay número configurado el botón no se dibuja, y la pantalla muestra
 * el camino de la pasarela. Nunca un botón que no lleva a ningún lado.
 */
export function BotonSuscribirme({
  whatsapp, empresa, plan, precio, periodo, etiqueta = 'Suscribirme',
}: {
  /** Solo dígitos, con código de país. Sin esto no se dibuja nada. */
  whatsapp: string | null;
  empresa: string;
  plan: string;
  /** Ya formateado, como lo ve la persona en la tarjeta. */
  precio: string;
  periodo: 'mensual' | 'anual';
  etiqueta?: string;
}) {
  if (!whatsapp) return null;

  const cada = periodo === 'anual' ? 'al año' : 'al mes';
  const mensaje = `Hola! Quiero suscribirme a Orden.\n\n`
    + `Negocio: ${empresa}\n`
    + `Plan: ${plan}\n`
    + `Precio: ${precio} ${cada}\n\n`
    + `¿Cómo hago la transferencia?`;

  return (
    <a
      href={`https://wa.me/${whatsapp}?text=${encodeURIComponent(mensaje)}`}
      target="_blank"
      rel="noopener noreferrer"
      className="boton-principal flex w-full items-center justify-center gap-2"
    >
      <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor"
           strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 11.5a8.5 8.5 0 0 1-12.6 7.4L3 21l2.2-5.2A8.5 8.5 0 1 1 21 11.5Z" />
      </svg>
      {etiqueta}
    </a>
  );
}

/**
 * Para el plan que se cotiza: el precio depende de cuántos vendedores, así
 * que no se puede mandar un número — se manda la pregunta.
 */
export function BotonCotizar({
  whatsapp, empresa, etiqueta = 'Pedir cotización',
}: {
  whatsapp: string | null;
  empresa: string;
  etiqueta?: string;
}) {
  if (!whatsapp) return null;

  const mensaje = `Hola! Quiero el plan Premium de Orden.\n\n`
    + `Negocio: ${empresa}\n\n`
    + `¿Cuánto me saldría? Somos ___ personas cargando.`;

  return (
    <a
      href={`https://wa.me/${whatsapp}?text=${encodeURIComponent(mensaje)}`}
      target="_blank"
      rel="noopener noreferrer"
      className="boton-suave flex w-full items-center justify-center gap-2"
    >
      {etiqueta}
    </a>
  );
}
