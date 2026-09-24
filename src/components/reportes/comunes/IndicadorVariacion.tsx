import type { Textos } from '@/i18n';
import { variacion } from '@/lib/calculos';
import { porcentaje } from '@/lib/formato';

/**
 * UN NÚMERO DEL REPORTE CON SU FLECHA CONTRA EL PERÍODO ANTERIOR (23/09).
 *
 * Es el `Indicador` del panel con dos cosas que el reporte necesita:
 *
 *   · La flecha sabe si subir es bueno. En el panel siempre pinta de verde
 *     la subida, y para los gastos eso es al revés: gastar un 30 % más no es
 *     una buena noticia. `subirEsBueno={false}` la pinta de rojo.
 *   · Cuando antes no hubo nada, no inventa un porcentaje: dice «Antes:
 *     nada». `variacion()` devuelve null justo en ese caso, y un «▲ ∞ %» o
 *     un «▲ 100 %» serían un número que el dato no sostiene.
 *
 * `anterior` null = no se sabe (no se pidió, o no se puede ver): sin flecha.
 * El texto largo de la comparación queda en el `title`, para quien pasa el
 * dedo o usa lector de pantalla.
 */
export function IndicadorVariacion({
  titulo, valor, actual, anterior, formato, detalle, t,
  subirEsBueno = true, tono = 'neutro', destacado = false,
}: {
  titulo: string;
  /** El número grande, ya formateado (`dineroCorto`, `numero`…). */
  valor: string;
  /** Los dos números crudos que se comparan. */
  actual: number;
  anterior: number | null;
  /** Cómo se escribe el número de antes en el texto largo. */
  formato: (n: number) => string;
  detalle?: string;
  t: Textos;
  subirEsBueno?: boolean;
  tono?: 'neutro' | 'bueno' | 'malo';
  destacado?: boolean;
}) {
  const colorValor = tono === 'bueno' ? 'text-verde-fuerte' : tono === 'malo' ? 'text-rojo' : 'text-tinta';
  // Nada antes y nada ahora: no hay nada que comparar, ni siquiera un «0 %».
  const v = anterior === null || (!actual && !anterior) ? undefined : variacion(actual, anterior);
  const bueno = typeof v === 'number' && (v === 0 || (v > 0) === subirEsBueno);

  return (
    <div className={`tarjeta p-4 ${destacado ? 'ring-1 ring-verde/25' : ''}`}>
      <p className="titulo-seccion">{titulo}</p>
      <p className={`mt-2 text-[22px] font-titulo font-extrabold leading-none tracking-tight tabular-nums lg:text-[25px] ${colorValor}`}>
        {valor}
      </p>
      <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1">
        {typeof v === 'number' && anterior !== null && (
          <span
            className={`pastilla ${bueno ? 'bg-verde-claro text-verde-fuerte' : 'bg-rojo-claro text-rojo'}`}
            title={t.reportesComunes.indicador.contraAnterior(porcentaje(Math.abs(v), 0), formato(anterior))}
          >
            <span aria-hidden="true">{v >= 0 ? '▲' : '▼'}</span> {porcentaje(Math.abs(v), 0)}
          </span>
        )}
        {v === null && (
          <span className="text-[12px] font-semibold text-tinta/40">{t.reportesComunes.indicador.antesNada}</span>
        )}
        {detalle && <span className="text-[12.5px] text-tinta/50">{detalle}</span>}
      </div>
    </div>
  );
}
