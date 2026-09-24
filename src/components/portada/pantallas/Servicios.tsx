import type { TextosVitrina } from '@/i18n/textos/vitrina';
import { Celular, Entra, Tilde } from './Celular';

/**
 * LA AGENDA DE UNA BARBERÍA: el día con cada turno y su profesional (033),
 * uno que llegó por el link público (038), el botón de recordarle por
 * WhatsApp (043) y, abajo, el reparto (034-035).
 *
 * La agenda no está en la barra de abajo de servicios (Panel, Cobrar,
 * Gastos, Cierre): se entra por «Más», y por eso es «Más» el que está
 * encendido, como en la app.
 */
export function PantallaServicios({ v }: { v: TextosVitrina }) {
  const p = v.pantallas.servicios;
  return (
    <Celular
      resumen={p.resumen}
      negocio={p.negocio}
      derecha={v.hoy}
      mas={v.barra.mas}
      activa={-1}
      barra={[
        { icono: 'panel', texto: v.barra.panel },
        { icono: 'vender', texto: v.barra.cobrar },
        { icono: 'gastos', texto: v.barra.gastos },
        { icono: 'cierre', texto: v.barra.cierre },
      ]}
    >
      <Entra paso={0}>
        <div className="flex items-center justify-between gap-2 px-1">
          <p className="text-[15px] font-bold tracking-tight">{p.agenda}</p>
          <span className="flex rounded-full bg-superficie p-0.5 text-[10px] font-semibold">
            {p.vistas.map((vista, i) => (
              <span key={vista} className={`rounded-full px-2 py-1 ${i === 0 ? 'bg-verde text-sobre-verde' : 'text-tinta/60'}`}>
                {vista}
              </span>
            ))}
          </span>
        </div>
      </Entra>

      <Entra paso={1}>
        <ul className="tarjeta divide-y divide-borde overflow-hidden">
          {p.turnos.map((t) => (
            <li key={t.hora} className="flex items-start gap-2.5 px-3 py-2.5">
              <span className="w-10 shrink-0 pt-px text-[13px] font-bold tabular-nums">{t.hora}</span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13px] font-semibold">{t.cliente}</span>
                <span className="block text-[11px] leading-snug text-tinta/60">{t.servicio}</span>
                {t.estado === 'link' && (
                  <span className="pastilla mt-1 bg-verde-claro px-2 py-0.5 text-[10px] text-verde-fuerte">
                    <svg viewBox="0 0 24 24" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth={2.2}
                         strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                      <path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1" />
                      <path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1" />
                    </svg>
                    {p.porElLink}
                  </span>
                )}
              </span>
              {t.estado === 'cobrado' && (
                <span className="pastilla shrink-0 bg-verde px-2 py-0.5 text-[10px] text-sobre-verde">
                  <Tilde className="h-3 w-3" />{p.cobrado}
                </span>
              )}
              {t.estado === 'recordar' && (
                <span className="pastilla shrink-0 border border-verde/40 px-2 py-0.5 text-[10px] text-verde-fuerte">
                  <svg viewBox="0 0 24 24" className="h-3 w-3" fill="currentColor" aria-hidden>
                    <path d="M12 2.5a9.5 9.5 0 0 0-8.2 14.3L2.5 21.5l4.8-1.3A9.5 9.5 0 1 0 12 2.5Zm0 17.2a7.7 7.7 0 0 1-4-1.1l-.3-.2-2.8.8.8-2.7-.2-.3A7.7 7.7 0 1 1 12 19.7Zm4.2-5.8c-.2-.1-1.4-.7-1.6-.8s-.4-.1-.5.1-.6.8-.7.9-.3.2-.5.1a6.3 6.3 0 0 1-3.1-2.7c-.2-.4.2-.4.7-1.3a.4.4 0 0 0 0-.4l-.7-1.7c-.2-.5-.4-.4-.5-.4h-.5a.9.9 0 0 0-.6.3 2.7 2.7 0 0 0-.8 2 4.6 4.6 0 0 0 1 2.5 10.6 10.6 0 0 0 4.1 3.6c1.5.7 2.1.7 2.9.6a2.4 2.4 0 0 0 1.6-1.1 2 2 0 0 0 .1-1.1c0-.2-.2-.2-.4-.3Z" />
                  </svg>
                  {p.recordar}
                </span>
              )}
            </li>
          ))}
        </ul>
      </Entra>

      <Entra paso={2}>
        <div className="tarjeta p-3.5">
          <p className="text-[12.5px] font-bold tracking-tight">{p.reparto}</p>
          <ul className="mt-2 space-y-2">
            {p.personas.map((x) => (
              <li key={x.nombre} className="flex items-center justify-between gap-2">
                <span className="min-w-0">
                  <span className="block text-[12.5px] font-semibold">{x.nombre}</span>
                  <span className="block truncate text-[10.5px] text-tinta/60">{x.detalle}</span>
                </span>
                <span className={`shrink-0 text-[12px] font-bold tabular-nums ${x.debe ? 'text-rojo' : 'text-verde-fuerte'}`}>
                  {x.valor}
                </span>
              </li>
            ))}
          </ul>
        </div>
      </Entra>
    </Celular>
  );
}
