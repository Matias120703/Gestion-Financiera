import { dinero, porcentaje } from '@/lib/formato';
import { Seccion, Vacio, Barra } from '@/components/Piezas';
import type { Textos as Diccionario } from '@/i18n';

type Fila = { nombre: string; monto: number; participacion: number };

/**
 * EL REPORTE DE UNA CUENTA PERSONAL
 *
 * El reporte de negocio muestra vendido, ganancia bruta, ganancia neta,
 * ranking de productos, cobros por método y plata parada en stock. Ninguna
 * de esas seis cosas existe para alguien que cobra un sueldo, y verlas ahí
 * no es solo ruido: le dice que este sistema no es para él.
 *
 * Un reporte personal tiene tres preguntas y ninguna más:
 *
 *   · ¿Cuánto entró y cuánto salió?
 *   · ¿De dónde vino lo que entró?
 *   · ¿En qué se fue lo que salió?
 *
 * Nada de «ganancia»: una persona no produce ganancia, le queda o no le
 * queda. Por eso el tercer número se llama resultado del período.
 */
export function ReportePersonal({
  ingresos, gastos, porOrigen, porDestino, moneda, locale, t,
}: {
  ingresos: number;
  gastos: number;
  porOrigen: Fila[];
  porDestino: Fila[];
  moneda: string;
  locale: string;
  t: Diccionario;
}) {
  const plata = (n: number) => dinero(n, moneda, true, locale);
  const resultado = ingresos - gastos;

  return (
    <>
      <div className="grid grid-cols-3 gap-3">
        <Cifra titulo={t.reportePersonal.ingresos} valor={plata(ingresos)} tono="text-verde-fuerte" />
        <Cifra titulo={t.reportePersonal.gastos} valor={plata(gastos)} tono="text-rojo" />
        <Cifra
          titulo={t.reportePersonal.resultado}
          valor={plata(resultado)}
          tono={resultado >= 0 ? 'text-verde-fuerte' : 'text-rojo'}
          destacado
        />
      </div>

      <p className="text-[13px] leading-relaxed text-tinta/55">
        {resultado >= 0
          ? t.reportePersonal.ahorraste(plata(resultado))
          : t.reportePersonal.gastasteDeMas(plata(Math.abs(resultado)))}
      </p>

      <Seccion titulo={t.reportePersonal.origen}>
        <Listado filas={porOrigen} moneda={moneda} locale={locale} tono="verde"
          vacio={t.reportePersonal.sinIngresos} detalleVacio={t.reportePersonal.sinIngresosDetalle} />
      </Seccion>

      <Seccion titulo={t.reportePersonal.destino}>
        <Listado filas={porDestino} moneda={moneda} locale={locale} tono="rojo"
          vacio={t.reportePersonal.sinGastos} detalleVacio={t.reportePersonal.sinGastosDetalle} />
      </Seccion>
    </>
  );
}

function Cifra({
  titulo, valor, tono, destacado = false,
}: {
  titulo: string; valor: string; tono: string; destacado?: boolean;
}) {
  return (
    <div className={`tarjeta p-3.5 ${destacado ? 'ring-1 ring-verde/25' : ''}`}>
      <p className="titulo-seccion truncate">{titulo}</p>
      <p className={`mt-1 text-[17px] font-bold tracking-tight ${tono}`}>{valor}</p>
    </div>
  );
}

function Listado({
  filas, moneda, locale, tono, vacio, detalleVacio,
}: {
  filas: Fila[];
  moneda: string;
  locale: string;
  tono: 'verde' | 'rojo';
  vacio: string;
  detalleVacio: string;
}) {
  if (filas.length === 0) {
    return <div className="px-4 pb-4"><Vacio titulo={vacio} detalle={detalleVacio} /></div>;
  }

  return (
    <ul className="divide-y divide-borde border-t border-borde">
      {filas.map((f) => (
        <li key={f.nombre} className="px-4 py-3">
          <div className="flex items-baseline justify-between gap-3">
            <span className="truncate text-[14.5px] font-semibold">{f.nombre}</span>
            <span className="shrink-0 text-[14.5px] font-bold tabular-nums">
              {dinero(f.monto, moneda, true, locale)}
            </span>
          </div>
          <div className="mt-2 flex items-center gap-2.5">
            <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-arena">
              <div
                className={`h-full rounded-full ${tono === 'verde' ? 'bg-verde' : 'bg-rojo'}`}
                style={{ width: `${Math.min(100, f.participacion)}%` }}
              />
            </div>
            <span className="shrink-0 text-[12px] tabular-nums text-tinta/45">
              {porcentaje(f.participacion, 0)}
            </span>
          </div>
        </li>
      ))}
    </ul>
  );
}
