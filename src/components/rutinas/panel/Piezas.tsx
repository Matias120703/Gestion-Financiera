'use client';

import Link from 'next/link';

/**
 * LAS PIEZAS DE LAS PANTALLAS DE RUTINAS (098): los avisos y las pestañas.
 *
 * La hoja que sube desde abajo, la pregunta de «¿Seguro?» y el aviso de
 * error se mudaron a components/Hoja.tsx (01/10): ahora son la ventana de
 * toda la app, no solo de rutinas, con la cabecera y el pie fijos, la altura
 * en dvh y el teclado. Se reexportan acá para que las pantallas de rutinas y
 * campañas sigan importando de donde siempre.
 */
export { Hoja, Confirmar, MensajeError, PieHoja } from '@/components/Hoja';

export function MensajeListo({ texto, children }: { texto: string; children?: React.ReactNode }) {
  if (!texto) return null;
  return (
    <div role="status" className="rounded-xl bg-verde-claro px-4 py-3 text-[13.5px] font-semibold text-verde-fuerte aparecer">
      <p>✓ {texto}</p>
      {children && <div className="mt-2.5">{children}</div>}
    </div>
  );
}

/**
 * Pestañas que viven en la dirección (?ver=): se puede volver con «atrás»,
 * y un aviso de «Para atender» puede abrir la carpeta justo en Progreso.
 * `replace` para que cambiar de pestaña no llene el historial.
 */
export function Pestanas({
  opciones, actual,
}: {
  opciones: { valor: string; texto: string; href: string }[];
  actual: string;
}) {
  return (
    <div role="tablist" className="flex gap-1 rounded-2xl border border-borde/70 bg-superficie p-1">
      {opciones.map((o) => (
        <Link
          key={o.valor} href={o.href} replace scroll={false}
          role="tab" aria-selected={actual === o.valor}
          className={`flex min-h-[44px] flex-1 items-center justify-center rounded-xl px-2 text-center text-[14px] font-bold transition ${
            actual === o.valor ? 'bg-verde-claro text-verde-fuerte' : 'text-tinta/55 hover:text-tinta'
          }`}
        >
          {o.texto}
        </Link>
      ))}
    </div>
  );
}
