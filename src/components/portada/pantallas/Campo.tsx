import type { TextosVitrina } from '@/i18n/textos/vitrina';
import { Celular, Entra } from './Celular';

/**
 * UNA CAMPAÑA DEL AGRICULTOR, desplegada como en TarjetaCampana.tsx (100):
 * costo, cobrado, un solo resultado, lo cosechado con kg/ha y sacas, y
 * cuántos kilos por hectárea hacían falta para cubrir el costo.
 *
 * Los números cierran: 50 ha a US$ 308/ha son US$ 15.400; 742 kg/ha a
 * US$ 415/t son US$ 308/ha; 120.000 kg a US$ 415/t son US$ 49.800; lo
 * cosechado menos lo vendido es lo que queda en el silo.
 *
 * La zafra es la 2025/26 y no la 2026/27: al 24/09/2026 la 26/27 se está
 * sembrando, y una campaña con silo lleno de esa zafra no sería creíble para
 * quien vive del campo.
 */
export function PantallaCampo({ v }: { v: TextosVitrina }) {
  const p = v.pantallas.agricultura;
  return (
    <Celular
      resumen={p.resumen}
      negocio={p.negocio}
      derecha={p.moneda}
      mas={v.barra.mas}
      activa={1}
      barra={[
        { icono: 'panel', texto: v.barra.panel },
        { icono: 'lotes', texto: v.barra.campanas },
        { icono: 'gastos', texto: v.barra.gastos },
        { icono: 'vender', texto: v.barra.vender },
      ]}
    >
      <Entra paso={0}>
        <p className="px-1 text-[15px] font-bold tracking-tight">{p.campanas}</p>
      </Entra>

      <Entra paso={1}>
        <div className="tarjeta p-3.5">
          <div className="flex items-start justify-between gap-2">
            <span className="min-w-0">
              <span className="block truncate text-[15px] font-bold">{p.nombre}</span>
              <span className="mt-0.5 block text-[10.5px] text-tinta/60">{p.detalle}</span>
            </span>
            <span className="shrink-0 text-right">
              <span className="block text-[15px] font-bold tabular-nums text-verde-fuerte">{p.resultado}</span>
              <span className="mt-0.5 block text-[10px] text-tinta/60">{p.resultadoHa}</span>
            </span>
          </div>

          <div className="mt-2.5 space-y-2 rounded-2xl border border-borde bg-arena/40 p-2.5">
            <dl className="space-y-1.5">
              {p.filas.map((f) => (
                <div key={f.titulo}>
                  <div className="flex items-baseline gap-2">
                    <dt className="w-[62px] shrink-0 text-[10.5px] font-semibold text-tinta/60">{f.titulo}</dt>
                    <dd className={`min-w-0 text-[12.5px] font-bold tabular-nums ${f.tono === 'bueno' ? 'text-verde-fuerte' : ''}`}>
                      {f.valor}
                      {f.extra && <> <span className="whitespace-nowrap text-[10px] font-medium text-tinta/60">{f.extra}</span></>}
                    </dd>
                  </div>
                  {f.nota && <p className="pl-[70px] text-[10px] leading-snug text-tinta/60">{f.nota}</p>}
                </div>
              ))}
            </dl>
            <p className="rounded-xl bg-superficie px-2.5 py-1.5 text-[10.5px] leading-snug text-tinta/70">{p.cubrir}</p>
            <p className="pastilla bg-ambar-claro px-2 py-0.5 text-[10.5px] text-ambar">{p.silo}</p>
          </div>

          <div className="mt-2.5 flex gap-1.5">
            <span className="boton-principal px-3.5 py-1.5 text-[11.5px]">{p.cosecha}</span>
            <span className="boton-suave px-3.5 py-1.5 text-[11.5px]">{p.liquidacion}</span>
          </div>
        </div>
      </Entra>
    </Celular>
  );
}
