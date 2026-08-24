import { dinero, porcentaje } from '@/lib/formato';
import { fechaLegible } from '@/lib/formato';
import type { FilaDia } from '@/lib/calculos';

/** Tarjeta de indicador con variación opcional contra el periodo anterior. */
export function Indicador({
  titulo, valor, detalle, variacion: v, tono = 'neutro', destacado = false,
}: {
  titulo: string;
  valor: string;
  detalle?: string;
  variacion?: number | null;
  tono?: 'neutro' | 'bueno' | 'malo';
  destacado?: boolean;
}) {
  const colorValor =
    tono === 'bueno' ? 'text-verde-fuerte' : tono === 'malo' ? 'text-rojo' : 'text-tinta';

  return (
    <div className={`tarjeta p-4 ${destacado ? 'ring-1 ring-verde/25' : ''}`}>
      <p className="titulo-seccion">{titulo}</p>
      <p className={`mt-2 text-[22px] font-bold leading-none tracking-tight tabular-nums lg:text-[25px] ${colorValor}`}>
        {valor}
      </p>
      <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1">
        {typeof v === 'number' && (
          <span className={`pastilla ${v >= 0 ? 'bg-verde-claro text-verde-fuerte' : 'bg-rojo-claro text-rojo'}`}>
            {v >= 0 ? '▲' : '▼'} {porcentaje(Math.abs(v), 0)}
          </span>
        )}
        {detalle && <span className="text-[12.5px] text-tinta/50">{detalle}</span>}
      </div>
    </div>
  );
}

/** Barras diarias en SVG. Sin librerías: liviano y funciona sin JavaScript. */
export function GraficoDiario({ datos, moneda }: { datos: FilaDia[]; moneda: string }) {
  if (datos.length === 0) return null;

  const maximo = Math.max(...datos.map((d) => Math.max(d.ventas, d.gastos)), 1);
  const ancho = 100 / datos.length;
  const mostrarEtiqueta = datos.length <= 14;

  return (
    <div>
      <div className="flex h-[150px] items-end gap-[3px]">
        {datos.map((d) => {
          const hv = (d.ventas / maximo) * 100;
          const hg = (d.gastos / maximo) * 100;
          return (
            <div key={d.fecha} className="group relative flex h-full flex-1 items-end gap-[2px]" style={{ minWidth: `${Math.max(ancho, 2)}%` }}>
              <div className="flex h-full w-full items-end gap-[2px]">
                <div className="w-full rounded-t bg-verde/85 transition group-hover:bg-verde" style={{ height: `${Math.max(hv, d.ventas > 0 ? 3 : 0)}%` }} />
                <div className="w-full rounded-t bg-rojo/35 transition group-hover:bg-rojo/60" style={{ height: `${Math.max(hg, d.gastos > 0 ? 3 : 0)}%` }} />
              </div>
              <div className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-1.5 hidden -translate-x-1/2 whitespace-nowrap rounded-lg bg-tinta px-2.5 py-1.5 text-[11.5px] font-semibold text-white group-hover:block">
                <span className="block">{fechaLegible(d.fecha, false)}</span>
                <span className="block text-verde-claro">Vendido {dinero(d.ventas, moneda)}</span>
                {d.gastos > 0 && <span className="block text-white/60">Gastado {dinero(d.gastos, moneda)}</span>}
              </div>
            </div>
          );
        })}
      </div>

      {mostrarEtiqueta && (
        <div className="mt-2 flex gap-[3px]">
          {datos.map((d) => (
            <span key={d.fecha} className="flex-1 text-center text-[10px] font-semibold text-tinta/35">
              {d.fecha.slice(8)}
            </span>
          ))}
        </div>
      )}

      <div className="mt-3 flex gap-4 text-[12px] font-semibold text-tinta/50">
        <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-verde/85" /> Ventas</span>
        <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-rojo/35" /> Gastos</span>
      </div>
    </div>
  );
}

/** Barra de progreso horizontal reutilizable. */
export function Barra({ porcentaje: p, tono = 'verde' }: { porcentaje: number; tono?: 'verde' | 'rojo' | 'ambar' }) {
  const color = tono === 'rojo' ? 'bg-rojo' : tono === 'ambar' ? 'bg-ambar' : 'bg-verde';
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-borde">
      <div className={`h-full rounded-full ${color} transition-all`} style={{ width: `${Math.min(100, Math.max(0, p))}%` }} />
    </div>
  );
}

export function Vacio({ titulo, detalle, icono }: { titulo: string; detalle: string; icono?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-12 text-center">
      {icono && <div className="mb-3 text-tinta/20">{icono}</div>}
      <p className="text-[15px] font-bold">{titulo}</p>
      <p className="mt-1 max-w-xs text-[13.5px] leading-relaxed text-tinta/50">{detalle}</p>
    </div>
  );
}

export function Seccion({
  titulo, accion, children, sinBorde = false,
}: {
  titulo: string;
  accion?: React.ReactNode;
  children: React.ReactNode;
  sinBorde?: boolean;
}) {
  return (
    <section className={sinBorde ? '' : 'tarjeta overflow-hidden'}>
      <div className="flex items-center justify-between gap-3 px-4 pb-1 pt-4">
        <h2 className="text-[15px] font-bold tracking-tight">{titulo}</h2>
        {accion}
      </div>
      {children}
    </section>
  );
}
