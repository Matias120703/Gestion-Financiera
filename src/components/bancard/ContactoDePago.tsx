'use client';

import Link from 'next/link';
import { useTextos } from '@/i18n/cliente';

/**
 * LA SECCIÓN DE CONTACTO QUE PIDE BANCARD (manual: «El Comercio debe incluir
 * en su aplicación la sección de Contacto, de manera que el cliente pueda
 * evacuar consultas referentes a las compras»).
 *
 * El WhatsApp de Orden (el de soporte, o el general), con el número de
 * pedido ya escrito; y los Términos, donde están el contacto y cómo se paga.
 * Sin WhatsApp configurado, lleva al contacto de los Términos.
 */
export function ContactoDePago({ pedido = null }: { pedido?: number | null }) {
  const t = useTextos();
  const c = t.bancard.contacto;
  const numero = (process.env.NEXT_PUBLIC_WHATSAPP_SOPORTE || process.env.NEXT_PUBLIC_WHATSAPP || '').replace(/[^\d]/g, '');
  const mensaje = encodeURIComponent(c.mensaje(pedido ? String(pedido) : null));

  return (
    <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[12.5px] font-semibold">
      {numero ? (
        <a href={`https://wa.me/${numero}?text=${mensaje}`} target="_blank" rel="noopener noreferrer" className="text-verde-fuerte underline-offset-2 hover:underline">
          {c.dudas}
        </a>
      ) : (
        <Link href="/terminos#contacto" className="text-verde-fuerte underline-offset-2 hover:underline">{c.dudas}</Link>
      )}
      <Link href="/terminos" className="text-tinta/45 underline-offset-2 hover:underline">{c.terminos}</Link>
    </p>
  );
}
