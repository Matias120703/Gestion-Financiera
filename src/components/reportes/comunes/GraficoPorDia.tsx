import type { Textos } from '@/i18n';
import { traerSerieDiaria } from '@/lib/agregados';
import type { FilaDia } from '@/lib/calculos';
import { diffDias, sumarDias } from '@/lib/fechas';
import type { Moneda } from '@/lib/formato';
import { GraficoDiario, Seccion } from '@/components/Piezas';

/** Más barras que esto no se leen en un celular: se muestran los últimos. */
const TOPE_DE_DIAS = 92;

/**
 * EL GRÁFICO POR DÍA DE LOS REPORTES (23/09).
 *
 * Reportes nunca tuvo gráfico: `traerSerieDiaria` existía y solo la usaban
 * el panel y el Excel. Son las mismas barras del panel (`GraficoDiario`),
 * con la palabra del rubro en la barra verde («Cobrado» en una barbería).
 *
 * Lee la serie él mismo (componente de servidor) salvo que el reporte ya la
 * tenga: `serie` la reusa y no se pide dos veces. Con más de 92 días se
 * muestran los últimos 92 y se dice. Sin un solo peso en todo el rango no se
 * dibuja nada: un piso de barras vacías parece un dato y no lo es.
 */
export async function GraficoPorDia({
  empresaId, desde, hasta, moneda, t, locale, etiquetaVentas, serie,
}: {
  empresaId: string;
  desde: string;
  hasta: string;
  moneda: Moneda;
  t: Textos;
  locale: string;
  /** La barra verde: «Vendido», «Cobrado»… (`palabra(…, 'ventas', …)`). */
  etiquetaVentas: string;
  /** La serie, si el reporte ya la leyó para otra cosa. */
  serie?: FilaDia[];
}) {
  const largo = diffDias(desde, hasta) + 1;
  const recortado = largo > TOPE_DE_DIAS;
  const desdeSerie = recortado ? sumarDias(hasta, -(TOPE_DE_DIAS - 1)) : desde;

  const datos = serie
    ? serie.filter((d) => d.fecha >= desdeSerie && d.fecha <= hasta)
    : await traerSerieDiaria(empresaId, desdeSerie, hasta);

  if (datos.length < 2 || !datos.some((d) => d.ventas > 0 || d.gastos > 0)) return null;

  const g = t.reportesComunes.grafico;
  return (
    <Seccion titulo={g.titulo}>
      <div className="px-4 pb-4 pt-3">
        <GraficoDiario
          datos={datos}
          moneda={moneda}
          locale={locale}
          textos={{
            graficoVendido: (monto: string) => `${etiquetaVentas} ${monto}`,
            graficoGastado: g.gastado,
            graficoVentas: etiquetaVentas,
            graficoGastos: g.gastos,
          }}
        />
        {recortado && <p className="mt-2 text-[12px] text-tinta/45">{g.recortado(TOPE_DE_DIAS)}</p>}
      </div>
    </Seccion>
  );
}
