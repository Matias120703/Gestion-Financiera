import type { Textos } from '@/i18n';
import { BotonExcel } from '@/components/BotonExcel';
import { fechaLegible } from '@/lib/formato';
import type { HojaDelLibro } from '@/lib/reportes/comun';

/**
 * LA TARJETA PARA BAJAR EL EXCEL, CON LAS HOJAS QUE DE VERDAD TRAE (23/09).
 *
 * Decía «5 hojas: resumen, productos, movimientos, gastos y día por día» a
 * todos los negocios por igual. Al agricultor le llegaban Campañas y
 * Liquidaciones y ningún día por día; al profe, una hoja de productos con
 * sus paquetes a margen 100 %. Ahora la lista la da el mismo libro
 * (`hojas<Variante>` en src/lib/reportes/excel-*.ts, o `hojasDelLibroDeHoy`
 * mientras la variante no tenga el suyo), y una prueba arma el archivo y
 * compara. Las hojas que salen solo si hubo algo se nombran «(si hubo)».
 */
export function TarjetaDescarga({
  empresaId, desde, hasta, hojas, t, locale,
}: {
  empresaId: string;
  desde: string;
  hasta: string;
  hojas: HojaDelLibro[];
  t: Textos;
  locale: string;
}) {
  const d = t.reportesComunes.descarga;
  const nombres = hojas.map((h) => (h.siHay ? d.siHubo(h.nombre) : h.nombre));
  const lista = nombres.length > 1
    ? `${nombres.slice(0, -1).join(', ')} ${d.y} ${nombres[nombres.length - 1]}`
    : nombres.join('');

  return (
    <div className="tarjeta flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <h2 className="text-[16px] font-bold tracking-tight">{d.titulo}</h2>
        <p className="mt-1 text-[13.5px] leading-relaxed text-tinta/55">
          {desde === hasta
            ? fechaLegible(desde, true, locale)
            : `${fechaLegible(desde, true, locale)} — ${fechaLegible(hasta, true, locale)}`}
        </p>
        {hojas.length > 0 && (
          <p className="mt-1 text-[13px] leading-relaxed text-tinta/50">{d.hojas(lista)}</p>
        )}
      </div>
      <BotonExcel empresaId={empresaId} desde={desde} hasta={hasta} />
    </div>
  );
}
