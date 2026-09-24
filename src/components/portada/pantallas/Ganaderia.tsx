import type { TextosVitrina } from '@/i18n/textos/vitrina';
import { Celular, Entra } from './Celular';

/**
 * LOS LOTES DE UN GANADERO (044-045): cada lote junta lo puesto y lo cobrado
 * y da un resultado, grande, y abajo por cabeza. Dos lotes cerrados para
 * que se vea para qué sirve: comparar una tropa con otra.
 *
 * La barra del ganadero es la de siempre sin el cierre (Panel, Vender,
 * Gastos): los lotes están en «Más», y es «Más» el que se enciende.
 */
export function PantallaGanaderia({ v }: { v: TextosVitrina }) {
  const p = v.pantallas.ganaderia;
  return (
    <Celular
      resumen={p.resumen}
      negocio={p.negocio}
      mas={v.barra.mas}
      activa={-1}
      barra={[
        { icono: 'panel', texto: v.barra.panel },
        { icono: 'vender', texto: v.barra.vender },
        { icono: 'gastos', texto: v.barra.gastos },
      ]}
    >
      <Entra paso={0}>
        <div className="px-1">
          <p className="text-[15px] font-bold tracking-tight">{p.lotes}</p>
          <p className="mt-0.5 text-[10.5px] text-tinta/60">{p.explicacion}</p>
        </div>
      </Entra>

      {p.lista.map((l, i) => (
        <Entra key={l.nombre} paso={1 + i}>
          <div className="tarjeta p-3.5">
            <div className="flex items-start justify-between gap-2">
              <span className="min-w-0">
                <span className="block truncate text-[14px] font-bold">{l.nombre}</span>
                <span className="mt-0.5 block text-[10.5px] text-tinta/60">{l.detalle}</span>
              </span>
              <span className="pastilla shrink-0 bg-arena px-2 py-0.5 text-[9.5px] text-tinta/60">{p.cerrado}</span>
            </div>
            <div className="mt-2 flex flex-wrap items-baseline justify-between gap-x-2 gap-y-1">
              <span className="font-titulo text-[20px] font-extrabold leading-none tracking-tight tabular-nums text-verde-fuerte">
                {l.resultado}
              </span>
              <span className="pastilla bg-verde-claro px-2 py-0.5 text-[10px] tabular-nums text-verde-fuerte">{l.porCabeza}</span>
            </div>
            <div className="mt-2.5 flex flex-wrap gap-x-3 gap-y-0.5 border-t border-borde pt-2 text-[10.5px] text-tinta/60">
              <span>{p.puesto}: <b className="tabular-nums text-tinta/80">{l.puesto}</b></span>
              <span>{p.cobrado}: <b className="tabular-nums text-tinta/80">{l.cobrado}</b></span>
            </div>
          </div>
        </Entra>
      ))}
    </Celular>
  );
}
