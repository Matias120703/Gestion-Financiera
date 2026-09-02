import Link from 'next/link';
import { redirect } from 'next/navigation';
import { contextoObligatorio } from '@/lib/sesion';
import { fichaDe } from '@/lib/rubros';
import { comparar, traerCierre } from '@/lib/habito';
import { dinero, dineroCorto, fechaLarga, porcentaje } from '@/lib/formato';
import { textos } from '@/i18n';
import { FICHA } from '@/i18n/idiomas';
import { permisosDe } from '@/lib/permisos';
import { TarjetaRacha } from '@/components/Racha';
import { BotonCerrarDia } from '@/components/BotonCerrarDia';
import { Vacio } from '@/components/Piezas';

export const dynamic = 'force-dynamic';

/**
 * EL CIERRE DEL DÍA
 *
 * La pantalla más importante para que Orden se use todos los días, y la más
 * corta a propósito: tiene que leerse de un vistazo, parada en la vereda,
 * antes de bajar la persiana.
 *
 * Tres números y una comparación. Nada más. Todo lo demás está a un toque de
 * distancia en el panel, y meterlo acá arruinaría lo único que esta pantalla
 * hace bien: cerrar el día en diez segundos.
 */
export default async function PaginaCierre({
  searchParams,
}: {
  searchParams: Record<string, string | string[] | undefined>;
}) {
  const ctx = await contextoObligatorio();
  // Este rubro no tiene esta pantalla. Ver src/lib/rubros.ts.
  if (fichaDe(ctx.empresa.rubro, ctx.empresa.tipo_cuenta).sinSecciones.includes('/cierre')) redirect('/panel');

  const t = textos();
  const locale = FICHA[ctx.idioma].locale;
  const abrev = t.formato;
  const m = ctx.empresa.moneda;

  // Permite mirar el cierre de un día pasado desde el historial.
  const pedida = typeof searchParams.fecha === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(searchParams.fecha)
    ? searchParams.fecha
    : undefined;

  const cierre = await traerCierre(ctx.empresa.id, pedida);
  const permisos = permisosDe(ctx.miembro.rol);
  const verRent = permisos.verRentabilidad && cierre.resumen.con_costos;

  const r = cierre.resumen;
  const entro = Number(r.ventas) + Number(r.otros_ingresos);
  const salio = Number(r.gastos);
  const quedo = verRent && r.ganancia_neta !== null ? Number(r.ganancia_neta) : null;

  const vsSemana = comparar(entro, Number(cierre.misma_dia_semana_pasada.ventas)
    + Number(cierre.misma_dia_semana_pasada.otros_ingresos));
  const vsPromedio = comparar(entro, Number(cierre.promedio_semana.ventas));

  return (
    <div className="mx-auto max-w-lg space-y-4">
      <header>
        <p className="titulo-seccion">{t.cierre.titulo}</p>
        <h1 className="mt-1 text-[22px] font-bold capitalize leading-tight tracking-tight">
          {fechaLarga(cierre.fecha, locale)}
        </h1>
        <p className="mt-1 text-[13px] font-semibold text-tinta/45">{t.cierre.subtitulo}</p>
      </header>

      {!cierre.hubo_actividad ? (
        <div className="tarjeta">
          <Vacio titulo={t.cierre.sinActividad} detalle={t.cierre.sinActividadDetalle} />
        </div>
      ) : (
        <>
          {/* ---------------- Los tres números ---------------- */}
          <div className="tarjeta divide-y divide-borde">
            <Fila
              etiqueta={t.cierre.entro}
              valor={dinero(entro, m, true, locale)}
              tono="bueno"
            />
            <Fila
              etiqueta={t.cierre.salio}
              valor={dinero(salio, m, true, locale)}
              tono={salio > 0 ? 'malo' : 'neutro'}
            />
            {quedo !== null && (
              <Fila
                etiqueta={t.cierre.quedo}
                valor={dinero(quedo, m, true, locale)}
                tono={quedo >= 0 ? 'bueno' : 'malo'}
                destacado
              />
            )}
          </div>

          {/* ---------------- Contra qué se compara ----------------
              Dos comparaciones y no cinco. La del mismo día de la semana
              pasada evita castigar un lunes contra un sábado; la del
              promedio dice si fue un día bueno "para vos". */}
          {(vsSemana !== null || vsPromedio !== null) && (
            <div className="tarjeta space-y-2.5 p-4">
              {vsSemana !== null && (
                <Comparacion valor={vsSemana} texto={t.cierre.vsSemanaPasada} t={t} locale={locale} />
              )}
              {vsPromedio !== null && (
                <Comparacion valor={vsPromedio} texto={t.cierre.vsPromedio} t={t} locale={locale} />
              )}
            </div>
          )}

          {/* ---------------- Producto estrella ---------------- */}
          {cierre.producto_estrella && (
            <div className="tarjeta p-4">
              <p className="titulo-seccion">{t.cierre.estrella}</p>
              <div className="mt-2 flex items-baseline justify-between gap-3">
                <span className="truncate text-[16px] font-bold tracking-tight">
                  {cierre.producto_estrella.nombre}
                </span>
                <span className="shrink-0 text-[15px] font-bold tabular-nums text-verde-fuerte">
                  {dineroCorto(Number(cierre.producto_estrella.ingresos), m, locale, abrev)}
                </span>
              </div>
            </div>
          )}
        </>
      )}

      <TarjetaRacha racha={cierre.racha} t={t} />

      {/* Solo se cierra el día de hoy. Marcar como "visto" un día de la
          semana pasada no significa nada. */}
      {cierre.es_hoy && cierre.hubo_actividad && (
        <BotonCerrarDia empresaId={ctx.empresa.id} fecha={cierre.fecha} yaCerrado={cierre.ya_cerrado} />
      )}

      {cierre.ya_cerrado && cierre.es_hoy && (
        <p className="text-center text-[13px] font-semibold text-tinta/40">{t.cierre.volverManiana}</p>
      )}

      <div className="pt-1 text-center">
        <Link href="/panel" className="boton-texto">{t.comun.verTodo}</Link>
      </div>
    </div>
  );
}

function Fila({
  etiqueta, valor, tono = 'neutro', destacado = false,
}: {
  etiqueta: string;
  valor: string;
  tono?: 'neutro' | 'bueno' | 'malo';
  destacado?: boolean;
}) {
  const color = tono === 'bueno' ? 'text-verde-fuerte' : tono === 'malo' ? 'text-rojo' : 'text-tinta';
  return (
    <div className="flex items-baseline justify-between gap-4 px-4 py-3.5">
      <span className={`text-[14px] ${destacado ? 'font-bold text-tinta' : 'font-semibold text-tinta/55'}`}>
        {etiqueta}
      </span>
      <span className={`tabular-nums ${destacado ? 'text-[22px] font-bold' : 'text-[17px] font-bold'} ${color}`}>
        {valor}
      </span>
    </div>
  );
}

function Comparacion({
  valor, texto, t, locale,
}: {
  valor: number;
  texto: string;
  t: ReturnType<typeof textos>;
  locale: string;
}) {
  // Menos de un 3% es ruido, no una tendencia. Decir "subiste 1,2%" sobre
  // dos días distintos es darle significado a una casualidad.
  const plano = Math.abs(valor) < 3;
  const p = porcentaje(Math.abs(valor), 0, locale);

  const frase = plano
    ? t.cierre.igualQue
    : valor > 0
      ? t.cierre.masQue(p)
      : t.cierre.menosQue(p);

  const color = plano ? 'text-tinta/50' : valor > 0 ? 'text-verde-fuerte' : 'text-rojo';

  return (
    <p className="text-[13.5px] leading-snug">
      <span className={`font-bold ${color}`}>{frase}</span>{' '}
      <span className="text-tinta/50">{texto}</span>
    </p>
  );
}
