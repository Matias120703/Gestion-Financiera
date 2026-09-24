import { redirect } from 'next/navigation';
import { contextoObligatorio } from '@/lib/sesion';
import { diaDeCobro } from '@/components/reportes/comunes/ciclo';
import { textos, idiomaActual, FICHA } from '@/i18n';
import { conJerga } from '@/i18n/jergas';
import { ReportePersonal } from '@/components/reportes/ReportePersonal';
import { hojasPersonal } from '@/lib/reportes/excel-personal';
import { traerResumen } from '@/lib/agregados';
import { hoyISO } from '@/lib/fechas';
import { permisosDe } from '@/lib/permisos';
import { fichaDe, type FichaRubro } from '@/lib/rubros';
import type { HojaDelLibro } from '@/lib/reportes/comun';
import type { Idioma } from '@/i18n/idiomas';
import { varianteDeReporte, type VarianteReporte } from '@/lib/reportes/variante';
import { rangoDeReporte, rangoPrevio, type ClaveRangoReporte } from '@/lib/reportes/rango';
import { SelectorRangoReporte } from '@/components/reportes/comunes/SelectorRangoReporte';
import { TarjetaDescarga } from '@/components/reportes/comunes/TarjetaDescarga';
import type { PropsReporte } from '@/components/reportes/comunes/tipos';
import { ReporteComercio } from '@/components/reportes/ReporteComercio';
import { ReporteAlumnos } from '@/components/reportes/ReporteAlumnos';
import { hojasAlumnos } from '@/lib/reportes/excel-alumnos';
import { hojasComercio } from '@/lib/reportes/excel-comercio';
import { ReporteCampo } from '@/components/reportes/ReporteCampo';
import { hojasCampo } from '@/lib/reportes/excel-campo';
import { ReporteServicios } from '@/components/reportes/ReporteServicios';
import { hojasServicios } from '@/lib/reportes/excel-servicios';

export const dynamic = 'force-dynamic';

/**
 * REPORTES: UNO POR FORMA DE TRABAJAR (23/09).
 *
 * Hasta acá había dos: el de una persona y el de «un negocio», que era el de
 * un almacén para todos. Ahora la página decide la variante
 * (`varianteDeReporte`: comercio, servicios, alumnos, campo o personal) y
 * hace solo lo que comparten las cinco:
 *
 *   · el rango, con «Este ciclo» y «Ciclo pasado» para quien cobra un
 *     sueldo (va de cobro a cobro, como el resto de su cuenta);
 *   · el resumen del período y el del período anterior, que alimentan la
 *     flecha de cada indicador;
 *   · la tarjeta de descarga, que dice las hojas que de verdad trae el
 *     archivo de ESA variante;
 *   · los textos con las palabras del oficio (`conJerga`), así el trainer
 *     lee «sesión» sin que el reporte pregunte nada.
 *
 * Lo demás lo lee y lo muestra el reporte de cada variante (ver
 * `PropsReporte`), con las piezas comunes (`IndicadorVariacion`,
 * `GraficoPorDia`) de `src/components/reportes/comunes`.
 */
export default async function PaginaReportes({
  searchParams: busqueda,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const searchParams = await busqueda;
  const ctx = await contextoObligatorio();
  // Reportes trae la ganancia y el detalle financiero del negocio entero:
  // es la vista del dueño en cualquiera de las dos cuentas, personal o no.
  if (!ctx.esAdmin) redirect('/panel');

  const idioma = await idiomaActual();
  const ficha = fichaDe(ctx.empresa.rubro, ctx.empresa.tipo_cuenta);
  const variante = varianteDeReporte(ficha, ctx.empresa.tipo_cuenta);
  const t = conJerga(await textos(), ficha.jerga, idioma);
  const locale = FICHA[idioma].locale;
  const hoy = hoyISO(ctx.zonaHoraria);

  // Solo una persona mide por ciclo. Sin día de cobro (o cobrando el 1) el
  // ciclo es el mes, y se entra por «Este mes»: el reporte de un solo día
  // no le dice nada a quien cobra una vez por mes.
  const diaCobro = variante === 'personal' ? await diaDeCobro(ctx.empresa.id) : null;
  const rango = rangoDeReporte(searchParams, hoy, diaCobro, rangoPorDefecto(variante, diaCobro));
  const previo = rangoPrevio(rango, diaCobro);

  const [resumen, resumenPrevio] = await Promise.all([
    traerResumen(ctx.empresa.id, rango.desde, rango.hasta),
    traerResumen(ctx.empresa.id, previo.desde, previo.hasta),
  ]);

  const permisos = permisosDe(ctx.miembro.rol);
  const props: PropsReporte = {
    empresaId: ctx.empresa.id,
    rubro: ctx.empresa.rubro ?? null,
    tipoCuenta: ctx.empresa.tipo_cuenta,
    ficha,
    rango,
    previo,
    resumen,
    resumenPrevio,
    moneda: ctx.vista,
    t,
    idioma,
    locale,
    zonaHoraria: ctx.zonaHoraria,
    hoy,
    permisos,
  };

  const hojas = hojasDeLaVariante(variante, ficha, idioma);

  return (
    <div className="space-y-5">
      <SelectorRangoReporte clave={rango.clave} desde={rango.desde} hasta={rango.hasta} diaCobro={diaCobro} />

      {permisos.descargarExcel && (
        <TarjetaDescarga
          empresaId={ctx.empresa.id} desde={rango.desde} hasta={rango.hasta}
          hojas={hojas} t={t} locale={locale}
        />
      )}

      <ReporteDeLaVariante variante={variante} {...props} />
    </div>
  );
}

/**
 * POR DÓNDE SE ENTRA sin rango elegido (24/09).
 *
 *   · Personal: «Este ciclo» si cobra un día fijo, si no «Este mes».
 *   · Alumnos y campo: «Este mes». El profe cobra dos o tres veces por mes,
 *     así que «Hoy» casi siempre le mostraría Cobrado 0, ninguna clase y ni
 *     una semana; el agricultor vería la caja de un día y solo las campañas
 *     abiertas hoy. La primera pantalla parecería vacía o rota.
 *   · Comercio y servicios: «Hoy», porque venden todos los días y lo primero
 *     que miran es cómo va la caja.
 */
function rangoPorDefecto(variante: VarianteReporte, diaCobro: number | null): ClaveRangoReporte {
  switch (variante) {
    case 'personal':
      return diaCobro ? 'ciclo' : 'mes';
    case 'alumnos':
    case 'campo':
      return 'mes';
    case 'comercio':
    case 'servicios':
      return 'hoy';
  }
}

/**
 * LAS HOJAS DEL ARCHIVO QUE BAJA ESTA CUENTA, para la tarjeta de descarga.
 * Salen del mismo libro que arma la ruta del Excel (misma variante), y cada
 * libro tiene una prueba (`pruebas/excel-<variante>.test.js`) que lo arma y
 * compara sus hojas con estas.
 */
function hojasDeLaVariante(variante: VarianteReporte, ficha: FichaRubro, idioma: Idioma): HojaDelLibro[] {
  switch (variante) {
    case 'comercio':
      return hojasComercio(ficha, idioma);
    case 'alumnos':
      return hojasAlumnos(ficha, idioma);
    case 'campo':
      return hojasCampo(ficha, idioma);
    case 'personal':
      return hojasPersonal(ficha, idioma);
    case 'servicios':
      return hojasServicios(ficha, idioma);
  }
}

/** EL DESPACHO: cada variante con su componente. */
function ReporteDeLaVariante({ variante, ...props }: PropsReporte & { variante: VarianteReporte }) {
  switch (variante) {
    case 'personal':
      return <ReportePersonal {...props} />;
    case 'alumnos':
      return <ReporteAlumnos {...props} />;
    case 'campo':
      return <ReporteCampo {...props} />;
    case 'comercio':
      return <ReporteComercio {...props} />;
    case 'servicios':
      return <ReporteServicios {...props} />;
  }
}
