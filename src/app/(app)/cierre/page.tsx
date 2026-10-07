import Link from 'next/link';
import { redirect } from 'next/navigation';
import { contextoObligatorio } from '@/lib/sesion';
import { fichaDeLaCuenta } from '@/lib/rubros';
import { comparar, traerCierre } from '@/lib/habito';
import { conCostoDeLoVendido, desgloseDelCierre, mercaderiaAparteDelCierre, salioDelCierre } from '@/lib/cierre-alumnos';
import { hoyISO } from '@/lib/fechas';
import { dinero, dineroCorto, fechaLarga, porcentaje } from '@/lib/formato';
import { textos, type Textos } from '@/i18n';
import { conJerga } from '@/i18n/jergas';
import { FICHA } from '@/i18n/idiomas';
import { permisosDe } from '@/lib/permisos';
import { TarjetaRacha } from '@/components/Racha';
import { BotonCerrarDia } from '@/components/BotonCerrarDia';
import { TarjetaRecomendar } from '@/components/TarjetaRecomendar';
import { clienteServidor } from '@/lib/supabase/servidor';
import { Vacio } from '@/components/Piezas';
import { DetalleCierre as Detalle, FilaCierre as Fila, NumerosCierreAlumnos } from '@/components/CierreAlumnos';

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
 *
 * EL PROFE QUE VENDE PRODUCTOS TAMBIÉN CIERRA (128). Matías, 07/10: «cuando
 * el profesor activa venta de productos, tiene que tener un cierre del día
 * también». Los números salen de la misma función de la base, que nunca
 * miró el rubro; lo que cambia es cómo se leen (components/CierreAlumnos):
 * lo que entró se abre en clases y productos, lo que salió es el «Gastado»
 * de su panel, y no se lo compara con la semana pasada.
 */
export default async function PaginaCierre({
  searchParams: busqueda,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const searchParams = await busqueda;
  const ctx = await contextoObligatorio();
  // Esta cuenta no tiene esta pantalla. Se pregunta por la CUENTA y no por
  // el rubro (128): el profe y el trainer la tienen solo con «También vendo
  // productos» prendido. Espejo de `cuenta_cierra_el_dia`; ver src/lib/rubros.ts.
  const ficha = fichaDeLaCuenta(ctx.empresa);
  if (!ficha.secciones['/cierre']) redirect('/panel');
  // Cómo cerró el día es la vista del dueño, no la de quien vendió hoy.
  if (!ctx.esAdmin) redirect('/panel');

  // El cierre del profe y del trainer (128), con las palabras de su oficio.
  const deAlumnos = ficha.agendaDeAlumnos;
  const t = conJerga(await textos(), ficha.jerga, ctx.idioma);
  const locale = FICHA[ctx.idioma].locale;
  const abrev = t.formato;
  /**
   * Se mira en la moneda de la vista (051): acá solo se informa, no se carga
   * nada. Las pantallas donde se ESCRIBE un importe siguen recibiendo
   * `ctx.empresa.moneda` a secas — un formulario en dólares que guardara el
   * número tal cual estaría guardando dólares como guaraníes.
   */
  const m = ctx.vista;

  // Permite mirar el cierre de un día pasado desde el historial.
  const pedida = typeof searchParams.fecha === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(searchParams.fecha)
    ? searchParams.fecha
    : undefined;

  // El pedido de recomendación va con el cierre en el mismo viaje: es un
  // extra, y no puede costarle una espera a la pantalla que tiene que
  // leerse en diez segundos. Si falla, no se pide y listo.
  //
  // Y solo para el profe (128), su panel de ESE día: la misma función de su
  // panel, en un período de un día, para abrir «Entró» en clases y productos
  // con los mismos números que ve allá. Es un detalle: si falla, el cierre
  // sale con sus tres números.
  const fechaPanel = pedida ?? hoyISO(ctx.zonaHoraria);
  const [cierre, momento, panelDelDia] = await Promise.all([
    traerCierre(ctx.empresa.id, pedida),
    Promise.resolve(clienteServidor().rpc('momento_de_recomendar', { p_empresa: ctx.empresa.id }))
      .then((r) => (r.data as { pedir?: boolean } | null)?.pedir === true)
      .catch(() => false),
    deAlumnos
      ? Promise.resolve(clienteServidor().rpc('panel_profe', {
          p_empresa: ctx.empresa.id, p_desde: fechaPanel, p_hasta: fechaPanel,
        })).then((r) => (r.error ? null : r.data)).catch(() => null)
      : Promise.resolve(null),
  ]);
  const permisos = permisosDe(ctx.miembro.rol);
  const verRent = permisos.verRentabilidad && cierre.resumen.con_costos;

  const r = cierre.resumen;
  const entro = Number(r.ventas) + Number(r.otros_ingresos);
  // Para el profe, todo lo que salió, como el «Gastado» de su panel (128):
  // ver salioDelCierre. Para el comercio, los gastos de siempre.
  const salio = deAlumnos ? salioDelCierre(r) : Number(r.gastos);
  // `?? 0`: si este código llegara antes que la migración 057, el cierre
  // sigue andando igual que antes en vez de romperse.
  const fiadoVendido = Number(cierre.fiado_vendido ?? 0);
  const fiadoCobrado = Number(cierre.fiado_cobrado ?? 0);
  const quedo = verRent && r.ganancia_neta !== null ? Number(r.ganancia_neta) : null;

  const vsSemana = comparar(entro, Number(cierre.misma_dia_semana_pasada.ventas)
    + Number(cierre.misma_dia_semana_pasada.otros_ingresos));
  const vsPromedio = comparar(entro, Number(cierre.promedio_semana.ventas));

  return (
    <div className="mx-auto max-w-lg space-y-4">
      <header>
        <p className="titulo-seccion">{t.cierre.titulo}</p>
        <h1 className="mt-1 text-[22px] font-titulo font-extrabold capitalize leading-tight tracking-tight">
          {fechaLarga(cierre.fecha, locale)}
        </h1>
        <p className="mt-1 text-[13px] font-semibold text-tinta/45">{t.cierre.subtitulo}</p>
      </header>

      {deAlumnos ? (
        <>
          <NumerosCierreAlumnos
            huboActividad={cierre.hubo_actividad}
            entro={entro}
            salio={salio}
            quedo={quedo}
            desglose={desgloseDelCierre(panelDelDia, fechaPanel, cierre.fecha)}
            mercaderiaAparte={mercaderiaAparteDelCierre(r)}
            conCostoDeLoVendido={conCostoDeLoVendido(r)}
            palabras={ficha.jerga === 'entrenamiento' ? t.reportesAlumnos.palabras.trainer : t.reportesAlumnos.palabras.profe}
            plata={(n) => dinero(n, m, true, locale)}
            t={t}
          />
          {/* Sin la comparación con la semana pasada: un profe cobra el mes
              por adelantado, y casi todos los días le diría «90 % menos». */}
          {cierre.hubo_actividad && cierre.producto_estrella && (
            <Estrella
              nombre={cierre.producto_estrella.nombre}
              valor={dineroCorto(Number(cierre.producto_estrella.ingresos), m, locale, abrev)}
              titulo={t.cierre.estrella}
            />
          )}
        </>
      ) : !cierre.hubo_actividad ? (
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
            {/* Lo que «Entró» no dice (057). Una venta fiada está sumada ahí
                arriba pero no llegó al cajón; lo cobrado de fiados viejos
                llegó al cajón pero no es una venta de hoy. Solo aparecen
                cuando no son cero: el cierre se lee en diez segundos. */}
            {fiadoVendido > 0 && (
              <Detalle
                etiqueta={t.cierreExtra.deEsoFiado}
                valor={dinero(fiadoVendido, m, true, locale)}
                nota={t.cierreExtra.seVendioNoEntro}
              />
            )}
            {fiadoCobrado > 0 && (
              <Detalle
                etiqueta={t.cierreExtra.cobrasteDeFiado}
                valor={dinero(fiadoCobrado, m, true, locale)}
                nota={t.cierreExtra.entroHoyDeOtrosDias}
              />
            )}
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
            <Estrella
              nombre={cierre.producto_estrella.nombre}
              valor={dineroCorto(Number(cierre.producto_estrella.ingresos), m, locale, abrev)}
              titulo={t.cierre.estrella}
            />
          )}
        </>
      )}

      {/* La racha del profe cuenta los días con clase dada (092) y lleva a
          su agenda, como en su panel. */}
      {deAlumnos
        ? <TarjetaRacha racha={cierre.racha} t={t} destino="/agenda" />
        : <TarjetaRacha racha={cierre.racha} t={t} />}

      {/* Solo con el día cerrado en verde, y solo hoy: pedirle un favor a
          alguien mirando un día malo —o el cierre de la semana pasada— es
          pedirlo en el peor momento. El encabezado lo arma esta pantalla
          porque es la que tiene los números. */}
      {momento && cierre.es_hoy && cierre.hubo_actividad && (quedo !== null ? quedo > 0 : entro > salio) && (
        <TarjetaRecomendar
          encabezado={cierre.racha.dias >= 7
            ? t.cierreExtra.diasSeguidos(cierre.racha.dias)
            : quedo !== null
              ? t.cierreExtra.cerrasteConGanancia(dinero(quedo, m, true, locale))
              : t.cierreExtra.hoyEntraron(dinero(entro, m, true, locale))}
        />
      )}

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

/**
 * Lo que más dejó ese día. Para el profe que vende puede ser «Raqueta» o el
 * nombre del paquete que cobró: es por lo que entró, como en el comercio.
 */
function Estrella({ titulo, nombre, valor }: { titulo: string; nombre: string; valor: string }) {
  return (
    <div className="tarjeta p-4">
      <p className="titulo-seccion">{titulo}</p>
      <div className="mt-2 flex items-baseline justify-between gap-3">
        <span className="truncate text-[16px] font-bold tracking-tight">{nombre}</span>
        <span className="shrink-0 text-[15px] font-bold tabular-nums text-verde-fuerte">{valor}</span>
      </div>
    </div>
  );
}

function Comparacion({
  valor, texto, t, locale,
}: {
  valor: number;
  texto: string;
  t: Textos;
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
