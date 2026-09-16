'use client';

import { useTextos } from '@/i18n/cliente';

/**
 * Lo que ve quien no administra el negocio en lugar del editor del reto.
 *
 * Vive aparte porque `EditorReto` decide si mostrar esto ANTES de llamar a
 * sus hooks, y un hook no se puede llamar después de una salida temprana.
 */
export function TextoSoloAdmin() {
  const t = useTextos();
  return (
    <p className="rounded-xl bg-arena px-4 py-3 text-[13px] leading-relaxed text-tinta/60">
      {t.pantallas.retoSoloAdmin}
    </p>
  );
}
