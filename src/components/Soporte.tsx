'use client';

import { useTextos } from '@/i18n/cliente';

/**
 * Cómo pedir ayuda.
 *
 * Suena chico y no lo es: sin esto, cuando algo se rompe, la persona no
 * escribe — desinstala. Y vos te enterás de los problemas cuando ya perdiste
 * al cliente.
 *
 * Va WhatsApp porque es donde tu cliente ya está. Un formulario de contacto
 * dentro de la app lo usa una de cada veinte personas; un WhatsApp lo usan
 * todas.
 *
 * Si no hay número configurado, la sección no se muestra: es peor prometer
 * soporte y que el enlace no lleve a ningún lado.
 */
export function Soporte() {
  const t = useTextos();

  const numero = (process.env.NEXT_PUBLIC_WHATSAPP_SOPORTE ?? '').replace(/[^\d]/g, '');
  const correo = process.env.NEXT_PUBLIC_EMAIL_SOPORTE ?? '';

  if (!numero && !correo) return null;

  const mensaje = encodeURIComponent(t.soporte.mensajeInicial);

  return (
    <div className="space-y-3 px-4 pb-5 pt-3">
      <p className="text-[13px] leading-relaxed text-tinta/55">{t.soporte.detalle}</p>

      <div className="flex flex-wrap gap-2">
        {numero && (
          <a
            href={`https://wa.me/${numero}?text=${mensaje}`}
            target="_blank"
            rel="noreferrer"
            className="boton-suave"
          >
            <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" fill="currentColor">
              <path d="M12 2a10 10 0 0 0-8.6 15.05L2 22l5.1-1.34A10 10 0 1 0 12 2Zm0 1.8a8.2 8.2 0 1 1-4.2 15.24l-.3-.18-3.03.8.81-2.95-.2-.31A8.2 8.2 0 0 1 12 3.8Zm4.7 10.4c-.25-.13-1.47-.72-1.7-.8-.23-.09-.4-.13-.56.12s-.64.8-.79.97c-.14.16-.29.18-.54.06a6.7 6.7 0 0 1-3.35-2.93c-.25-.43.25-.4.72-1.33.08-.16.04-.3-.02-.42l-.79-1.9c-.2-.47-.42-.4-.57-.41h-.48c-.17 0-.43.06-.66.31-.23.25-.86.85-.86 2.06s.89 2.39 1.01 2.56c.13.16 1.75 2.67 4.23 3.74 1.58.68 2.2.74 2.99.62.48-.07 1.47-.6 1.68-1.19.2-.58.2-1.08.15-1.18-.06-.11-.23-.17-.48-.3Z" />
            </svg>
            {t.soporte.whatsapp}
          </a>
        )}

        {correo && (
          <a href={`mailto:${correo}`} className="boton-suave">
            {t.soporte.email}
          </a>
        )}
      </div>

      <p className="text-[12px] leading-relaxed text-tinta/40">{t.soporte.horario}</p>
    </div>
  );
}
