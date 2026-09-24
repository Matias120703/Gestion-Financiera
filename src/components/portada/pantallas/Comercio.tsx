import type { TextosVitrina } from '@/i18n/textos/vitrina';
import { Celular, Entra, Tilde } from './Celular';

/**
 * EL PANEL DE UN COMERCIO. El número de arriba es el que da nombre a Orden:
 * lo que quedó después de la mercadería y los gastos (2.600.000 − 300.000 −
 * 150.000 = 2.150.000), y abajo cómo se cargó la venta: hablando.
 */
export function PantallaComercio({ v }: { v: TextosVitrina }) {
  const p = v.pantallas.comercio;
  return (
    <Celular
      resumen={p.resumen}
      negocio={p.negocio}
      derecha={v.hoy}
      mas={v.barra.mas}
      activa={0}
      barra={[
        { icono: 'panel', texto: v.barra.panel },
        { icono: 'vender', texto: v.barra.vender },
        { icono: 'gastos', texto: v.barra.gastos },
        { icono: 'cierre', texto: v.barra.cierre },
      ]}
    >
      <Entra paso={0}>
        <div className="tarjeta p-4">
          <p className="text-[10.5px] font-bold uppercase tracking-[.14em] text-tinta/60">{p.teQuedoHoy}</p>
          <p className="mt-1 font-titulo text-[28px] font-extrabold leading-none tracking-tight tabular-nums text-verde-fuerte">
            {p.monto}
          </p>
          <p className="mt-2 inline-flex items-center gap-1 rounded-full bg-verde-claro px-2 py-0.5 text-[11px] font-bold text-verde-fuerte">
            {p.variacion} <span className="font-medium text-tinta/60">{p.comparado}</span>
          </p>
          <dl className="mt-3 space-y-1.5 border-t border-borde pt-2.5">
            {p.filas.map((f) => (
              <div key={f.etiqueta} className="flex items-baseline justify-between gap-3 text-[12px]">
                <dt className="font-semibold text-tinta/60">{f.etiqueta}</dt>
                <dd className={`font-bold tabular-nums ${f.tono === 'malo' ? 'text-rojo' : 'text-tinta'}`}>{f.valor}</dd>
              </div>
            ))}
          </dl>
        </div>
      </Entra>

      <Entra paso={1}>
        <div className="tarjeta p-3.5">
          <p className="text-[10.5px] font-bold uppercase tracking-[.14em] text-tinta/60">{p.loCargasteAsi}</p>
          <div className="mt-2 flex items-start gap-2">
            <span className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full bg-verde-claro text-verde-fuerte">
              <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={2}
                   strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M12 15a3 3 0 0 0 3-3V6a3 3 0 1 0-6 0v6a3 3 0 0 0 3 3Z" />
                <path d="M18.5 11.5A6.5 6.5 0 0 1 5.5 11.5M12 18v3" />
              </svg>
            </span>
            <p className="text-[12.5px] font-medium leading-snug text-tinta/75">{p.dictado}</p>
          </div>
          <p className="mt-2.5 flex items-center gap-1.5 border-t border-borde pt-2 text-[11.5px] font-semibold text-verde-fuerte">
            <Tilde />
            {p.cargado}
          </p>
        </div>
      </Entra>

      <Entra paso={2}>
        <div className="tarjeta p-3.5">
          <p className="text-[12.5px] font-bold tracking-tight">{p.porAcabarse}</p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {p.stock.map((s) => (
              <span key={s} className="pastilla bg-ambar-claro px-2 py-0.5 text-[10.5px] text-ambar">{s}</span>
            ))}
          </div>
        </div>
      </Entra>
    </Celular>
  );
}
