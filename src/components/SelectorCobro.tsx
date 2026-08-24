'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';

/**
 * Elegir moneda y periodo del precio.
 *
 * Va por la URL y no por estado local a propósito: así el precio elegido
 * sobrevive a recargar, se puede compartir el enlace ("mirá, sale esto") y
 * los importes los sigue calculando el servidor desde la tabla `precios`.
 * Ninguna cifra viaja en el navegador donde se pueda tocar.
 */
export function SelectorCobro({
  moneda, periodo, monedas, etiquetaMensual, etiquetaAnual, etiquetaAhorro,
}: {
  moneda: string;
  periodo: 'mensual' | 'anual';
  monedas: string[];
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
    router.replace(`${ruta}?${siguientes.toString()}`, { scroll: false });
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex items-center gap-2">
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

      <div className="flex items-center gap-1.5">
        {monedas.map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => ir('moneda', m)}
            className={`rounded-lg px-2.5 py-1.5 text-[12.5px] font-bold transition ${
              m === moneda ? 'bg-tinta text-white' : 'text-tinta/45 hover:bg-arena'
            }`}
          >
            {m}
          </button>
        ))}
      </div>
    </div>
  );
}
