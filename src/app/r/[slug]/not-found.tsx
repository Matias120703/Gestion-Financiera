import { textos } from '@/i18n';

/**
 * LA PÁGINA DE RESERVAS QUE NO ESTÁ
 *
 * La muestra el `notFound()` de page.tsx cuando `agenda_publica` contesta
 * {existe: false}: un link que no existe, uno que el dueño apagó o el de un
 * negocio vencido (migración 115). Los tres dan esta misma pantalla a
 * propósito: distinguirlos le diría a cualquiera qué negocios usan Orden y
 * cuáles no pagaron.
 *
 * Hasta la 115 era el 404 de Next, en inglés y sin una palabra útil. Desde
 * que la página de un negocio vencido se apaga sola, la ven los clientes de
 * ese negocio que entran por el link de siempre: tiene que decirles qué
 * hacer, en su idioma, y que el turno que ya habían reservado sigue en pie.
 */
export default async function ReservasNoDisponibles() {
  const r = (await textos()).reservaPublica;
  return (
    <div className="min-h-screen bg-arena">
      <div className="mx-auto max-w-md px-4 pb-16 pt-10">
        <div className="rounded-2xl border border-borde bg-superficie p-5">
          <h1 className="text-[19px] font-bold tracking-tight">{r.noDisponible}</h1>
          <p className="mt-2 text-[14.5px] leading-relaxed text-tinta/60">{r.noDisponibleDetalle}</p>
          <p className="mt-3 text-[13.5px] leading-relaxed text-tinta/50">{r.siYaTeniasTurno}</p>
        </div>
        <p className="mt-8 text-center text-[11.5px] text-tinta/35">{r.turnosConOrden}</p>
      </div>
    </div>
  );
}
