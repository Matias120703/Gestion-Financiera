'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';

/**
 * Elegir el periodo del precio: por mes o por año.
 *
 * Va por la URL y no por estado local a propósito: así el precio elegido
 * sobrevive a recargar, se puede compartir el enlace ("mirá, sale esto") y
 * los importes los sigue calculando el servidor desde la tabla `precios`.
 * Ninguna cifra viaja en el navegador donde se pueda tocar.
 *
 * YA NO ELIGE MONEDA (23/09). Tenía también los botones Gs / US$; se
 * sacaron porque la suscripción se cobra siempre en guaraníes (Bancard deja
 * una sola moneda). El dólar queda como referencia chica al lado de cada
 * precio, no como algo que se elige. Ver `lib/precios.ts`.
 */
export function SelectorCobro({
  periodo, etiquetaMensual, etiquetaAnual, etiquetaAhorro,
}: {
  periodo: 'mensual' | 'anual';
  etiquetaMensual: string;
  etiquetaAnual: string;
  etiquetaAhorro: string;
}) {
  const router = useRouter();
  const ruta = usePathname();
  const params = useSearchParams();

  function ir(clave: string, valor: string) {
    const siguientes = new URLSearchParams(params.toString());
    siguientes.set(clave, valor);
    // Un enlace viejo con ?moneda=USD no cambia nada, pero tampoco se arrastra.
    siguientes.delete('moneda');
    router.replace(`${ruta}?${siguientes.toString()}`, { scroll: false });
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <button
        type="button"
        onClick={() => ir('periodo', 'mensual')}
        className={periodo === 'mensual' ? 'chip-encendido' : 'chip-apagado'}
      >
        {etiquetaMensual}
      </button>
      <button
        type="button"
        onClick={() => ir('periodo', 'anual')}
        className={periodo === 'anual' ? 'chip-encendido' : 'chip-apagado'}
      >
        {etiquetaAnual}
        {etiquetaAhorro && (
          <span className={`ml-2 rounded-full px-1.5 py-0.5 text-[10.5px] font-bold ${
            periodo === 'anual' ? 'bg-white/20 text-white' : 'bg-verde-claro text-verde-fuerte'
          }`}>
            {etiquetaAhorro}
          </span>
        )}
      </button>
    </div>
  );
}
