import Link from 'next/link';
import { contextoObligatorio } from '@/lib/sesion';
import { textos } from '@/i18n';
import { FICHA } from '@/i18n/idiomas';
import { precio as precioTexto } from '@/lib/formato';
import {
  LIMITES_VISIBLES, MONEDAS_DE_COBRO, mesesDeRegalo, monedaDeCobro, precioDe, traerPrecios,
  type PlanPago,
} from '@/lib/precios';
import type { PeriodoCobro } from '@/lib/tipos';
import { SelectorCobro } from '@/components/SelectorCobro';
import { BotonSuscribirme, BotonCotizar } from '@/components/BotonSuscribirme';
import { BotonPagar } from '@/components/BotonPagar';
import { TarjetaRecomendar } from '@/components/TarjetaRecomendar';
import { clienteServidor } from '@/lib/supabase/servidor';
import { traerDescuentoRacha } from '@/lib/habito';

export const dynamic = 'force-dynamic';

/**
 * PLANES Y PRECIOS
 *
 * Decisión de Matías (2026-09-15): vencida la prueba o el plan, no se puede
 * usar nada de Orden — el candado de pantalla completa (`CandadoCuenta`, en
 * el layout) tapa el resto de la app y manda para acá. Esta es la única
 * pantalla que sigue viéndose, porque es adonde hay que venir para pagar.
 * Los datos no se borran ni se pierden: quedan intactos esperando a que se
 * active el plan.
 *
 * EL PRECIO SE ELIGE EN SU MONEDA. Guaraníes para quien lee en español,
 * dólares para el resto, y se puede cambiar a mano. Ver un precio en una
 * moneda ajena obliga a hacer una cuenta mental antes de decidir, y esa
 * cuenta es donde se pierde la venta.
 */
export default async function PaginaPlan({
  searchParams: busqueda,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const searchParams = await busqueda;
  const ctx = await contextoObligatorio();
  const t = await textos();
  const locale = FICHA[ctx.idioma].locale;

  const moneda = monedaDeCobro(ctx.idioma, typeof searchParams.moneda === 'string' ? searchParams.moneda : null);
  const periodo: PeriodoCobro = searchParams.periodo === 'anual' ? 'anual' : 'mensual';

  const precios = await traerPrecios(moneda, ctx.empresa.tipo_cuenta);
  // Una cuenta personal tiene un solo plan pago. Ofrecerle el de un local
  // con vendedores sería venderle algo que no puede usar.
  const planesVisibles: PlanPago[] = ctx.empresa.tipo_cuenta === 'personal'
    ? ['pro']
    // Un negocio elige entre tres: Básico (uno solo), Pro y Premium (077).
    : ['basico', 'pro', 'negocio'];
  const sus = ctx.suscripcion;

  // Si es momento de ofrecerle recomendar Orden. Las reglas están en la
  // base (062); acá solo se pregunta, y si falla no se ofrece nada.
  const momentoRecomendar = await Promise.resolve(
    clienteServidor().rpc('momento_de_recomendar', { p_empresa: ctx.empresa.id }),
  ).then((r) => (r.data as { pedir?: boolean } | null)?.pedir === true).catch(() => false);
  const uso = ctx.capturasIA;

  // El descuento que se gana cargando durante la prueba (078). Si falla, no
  // se muestra la promo y la pantalla sigue igual.
  const descuento = await traerDescuentoRacha(ctx.empresa.id);

  // Mientras el cobro sea por transferencia, el camino es WhatsApp. Si algún
  // día se enchufa una pasarela, con quitar el número vuelve solo el botón de
  // pago: las dos rutas conviven sin tocar nada más.
  // `\D` es «todo lo que no sea un dígito». Sin la barra —como estuvo— la
  // expresión borra la letra D y deja espacios, signos y paréntesis, que
  // rompen el enlace de WhatsApp justo en la pantalla donde se cobra.
  const whatsapp = (process.env.NEXT_PUBLIC_WHATSAPP ?? '').replace(/\D/g, '') || null;

  const regalo = mesesDeRegalo(precioDe(precios, 'pro', 'mensual'), precioDe(precios, 'pro', 'anual'));

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <header>
        <h1 className="text-[22px] font-titulo font-extrabold tracking-tight">{t.plan.titulo}</h1>
      </header>

      {/* ---------------- Dónde está parada la persona ---------------- */}
      {sus.en_prueba && (
        <div className="tarjeta border-verde/40 bg-verde-claro/50 p-4">
          <p className="text-[15px] font-bold text-verde-fuerte">{t.plan.enPrueba}</p>
          <p className="mt-1 text-[14px] font-semibold">{t.plan.diasDePrueba(sus.dias_restantes)}</p>
          <p className="mt-1.5 text-[13px] leading-relaxed text-tinta/60">{t.plan.pruebaVence}</p>
        </div>
      )}

      {/* El otro momento para pedirlo: acaba de pagar. Es cuando más cree en
          el producto —puso plata— y es el único lugar donde la pantalla ya
          está hablando de plata con Orden y no con sus clientes.

          «Recién pagó» se deduce de los días que le quedan y no de una fecha
          de pago: el cobro lo anota la administración, no hay checkout. Con
          más de 25 días por delante en un plan mensual, pagó esta semana. */}
      {momentoRecomendar && sus.estado === 'activa' && !sus.en_prueba
        && sus.dias_restantes >= (sus.periodo === 'anual' ? 360 : 25) && (
        <TarjetaRecomendar encabezado={t.plan.alDia} />
      )}

      {!sus.en_prueba && ctx.planEfectivo === 'gratis' && sus.ya_uso_prueba && (
        <div className="tarjeta border-ambar/40 bg-ambar-claro/50 p-4">
          <p className="text-[15px] font-bold text-ambar">{t.plan.vencida}</p>
          <p className="mt-1.5 text-[13px] leading-relaxed text-tinta/60">{t.plan.vencidaDetalle}</p>
        </div>
      )}

      {/* Uso de IA del mes. Solo tiene sentido mostrarlo si hay un tope
          alcanzable: en un plan con 3000 capturas nadie mira este número. */}
      {uso.tope > 0 && uso.tope <= 100 && (
        <div className="tarjeta p-4">
          <div className="flex items-baseline justify-between gap-3">
            <span className="text-[13.5px] font-semibold text-tinta/60">
              {t.plan.capturasUsadas(uso.usados, uso.tope)}
            </span>
            <span className="text-[13px] font-bold tabular-nums">
              {Math.max(0, uso.tope - uso.usados)}
            </span>
          </div>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-arena">
            <div
              className={`h-full rounded-full ${uso.usados >= uso.tope ? 'bg-rojo' : 'bg-verde'}`}
              style={{ width: `${Math.min(100, (uso.usados / uso.tope) * 100)}%` }}
            />
          </div>
          {uso.usados >= uso.tope && (
            <p className="mt-2 text-[12.5px] leading-relaxed text-tinta/55">
              {t.plan.capturasAgotadasDetalle}
            </p>
          )}
        </div>
      )}

      {/* ---------------- El descuento que se gana usando Orden (078) ----------------
          Va antes de los precios a propósito: quien está mirando cuánto le
          sale tiene que enterarse ANTES de que puede pagar menos. */}
      {descuento && (descuento.vigente || descuento.logrado) && (
        <div className={`tarjeta p-4 ${descuento.logrado ? 'border-verde/50 bg-verde-claro/40' : ''}`}>
          {descuento.logrado ? (
            <>
              <p className="text-[15px] font-bold text-verde-fuerte">
                {descuento.fase === 'constancia'
                  ? t.plan.constanciaLogrado(Math.round(descuento.porcentaje))
                  : t.plan.descuentoLogrado(Math.round(descuento.porcentaje))}
              </p>
              <p className="mt-1.5 text-[13px] leading-relaxed text-tinta/60">
                {descuento.fase === 'constancia'
                  ? t.plan.constanciaLogradoDetalle(descuento.mejor)
                  : t.plan.descuentoLogradoDetalle}
              </p>
            </>
          ) : (
            <>
              <p className="text-[15px] font-bold">
                {descuento.fase === 'constancia'
                  ? t.plan.constanciaTitulo(Math.round(descuento.porcentaje))
                  : t.plan.descuentoTitulo(Math.round(descuento.porcentaje))}
              </p>
              <p className="mt-1 text-[13px] leading-relaxed text-tinta/60">
                {descuento.fase === 'constancia'
                  ? t.plan.constanciaComo(descuento.objetivo)
                  : t.plan.descuentoComo(descuento.objetivo)}
              </p>
              <div className="mt-3 flex items-center justify-between gap-3 text-[12.5px] font-semibold">
                <span className="text-tinta/70">{t.plan.descuentoVas(descuento.mejor, descuento.objetivo)}</span>
                <span className="text-verde-fuerte">{t.plan.descuentoFaltan(descuento.faltan)}</span>
              </div>
              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-arena">
                <div
                  className="h-full rounded-full bg-verde transition-all"
                  style={{ width: `${Math.min(100, (descuento.mejor / Math.max(1, descuento.objetivo)) * 100)}%` }}
                />
              </div>
            </>
          )}
        </div>
      )}

      <SelectorCobro
        moneda={moneda}
        periodo={periodo}
        monedas={[...MONEDAS_DE_COBRO]}
        etiquetaMensual={t.plan.mensual}
        etiquetaAnual={t.plan.anual}
        etiquetaAhorro={regalo > 0 ? t.plan.ahorroAnual(regalo) : ''}
      />

      {/* ---------------- Los planes ----------------
          Ya no aparece una tarjeta «Gratis». Gratis significa CUENTA
          VENCIDA: no se puede usar nada de Orden. Ofrecerlo como si fuera
          una opción era invitar a elegir el estado de «no poder trabajar». */}
      <div className={`grid gap-4 ${planesVisibles.length === 1 ? 'sm:max-w-md' : planesVisibles.length === 2 ? 'md:grid-cols-2' : 'md:grid-cols-3'}`}>
        {planesVisibles.map((plan) => {
          const precio = precioDe(precios, plan, periodo);
          const limites = LIMITES_VISIBLES[plan];
          /**
           * «Tu plan actual» solo si LO ESTÁ PAGANDO.
           *
           * Acá había un error que costaba plata: durante la prueba el plan
           * efectivo ES `pro`, así que la tarjeta de Pro se marcaba como actual
           * y se le escondía el botón. Resultado: quien estaba probando —el
           * único que está por decidir— no tenía forma de suscribirse.
           *
           * Estar en prueba no es estar pagando.
           */
          const esActual = !sus.en_prueba && ctx.planEfectivo === plan;

          return (
            <Tarjeta
              key={plan}
              nombre={t.plan[plan]}
              destacado={plan === 'pro'}
              /* Mientras la promo esté ganada, el precio lleva su cartel. */
              nota={descuento?.logrado
                ? (descuento.fase === 'constancia'
                    ? t.plan.constanciaEnPrecio(Math.round(descuento.porcentaje))
                    : t.plan.descuentoEnPrecio(Math.round(descuento.porcentaje)))
                : null}
              precio={precio ? precioTexto(Number(precio.importe), moneda, locale) : t.comun.sinDato}
              porPeriodo={periodo === 'anual' ? `/ ${t.plan.porAnio}` : `/ ${t.plan.porMes}`}
              actual={esActual}
              etiquetaActual={t.plan.actual}
              incluye={t.plan.incluye}
              puntos={
                ctx.empresa.tipo_cuenta === 'personal'
                  ? [
                      t.plan.capturasLibres,
                      t.plan.conAdjuntos,
                      t.plan.conExcel,
                      t.plan.soloVos,
                    ]
                  : plan === 'basico'
                    ? [
                        // El Básico no recorta el negocio: recorta la gente.
                        t.plan.todoElNegocio,
                        t.plan.soloUnaPersona,
                        t.plan.capturasMes(limites.capturas),
                        t.plan.conExcel,
                      ]
                    : [
                        t.plan.capturasLibres,
                        t.plan.personas(limites.miembros),
                        t.plan.conAdjuntos,
                        t.plan.conExcel,
                      ]
              }
              pie={
                esActual ? null : whatsapp ? (
                  // Premium se cotiza: el precio depende de cuántos vendedores,
                  // así que se manda la pregunta y no un número.
                  plan === 'negocio' && ctx.empresa.tipo_cuenta === 'emprendedor' ? (
                    <BotonCotizar whatsapp={whatsapp} empresa={ctx.empresa.nombre} />
                  ) : (
                    <BotonSuscribirme
                      whatsapp={whatsapp}
                      empresa={ctx.empresa.nombre}
                      plan={t.plan[plan]}
                      precio={precio ? precioTexto(Number(precio.importe), moneda, locale) : ''}
                      periodo={periodo}
                      etiqueta={sus.en_prueba ? t.plan.activarEstePlan : t.plan.suscribirme}
                    />
                  )
                ) : (
                  <BotonPagar
                    plan={plan}
                    periodo={periodo}
                    moneda={moneda}
                    etiqueta={t.plan.elegir}
                    sinPasarela={t.plan.pagoNoDisponible}
                  />
                )
              }
            />
          );
        })}
      </div>

      {/* Va con los precios porque es parte de la cuenta: el que está
          mirando cuánto le sale tiene que saber que puede recuperar parte
          trayendo a otro. Está en todos los planes, también en la prueba. */}
      <Link
        href="/recomendar"
        className="flex items-center justify-between gap-3 rounded-2xl border border-verde/30 bg-verde-claro/30 p-4 transition hover:bg-verde-claro/50"
      >
        <span className="min-w-0">
          <span className="block text-[14.5px] font-bold">{t.plan.podesBajar}</span>
          <span className="mt-0.5 block text-[13px] leading-relaxed text-tinta/65">
            {t.plan.podesBajarDetalle}
          </span>
        </span>
        <span className="shrink-0 text-[13px] font-semibold text-verde-fuerte">{t.plan.ver}</span>
      </Link>

      {whatsapp && (
        <div className="tarjeta p-4">
          <p className="titulo-seccion mb-1.5">{t.pantallas.comoSePaga}</p>
          <p className="text-[13.5px] leading-relaxed text-tinta/65">
            {t.pantallas.comoSePagaDetalle}
          </p>
        </div>
      )}

      <p className="text-center text-[12.5px] font-semibold text-tinta/40">
        {t.plan.sinTarjeta} · {t.plan.cancelarCuando}
      </p>
    </div>
  );
}

function Tarjeta({
  nombre, precio, porPeriodo, puntos, incluye, actual, etiquetaActual, destacado = false, pie = null, nota = null,
}: {
  nombre: string;
  precio: string;
  porPeriodo: string;
  puntos: string[];
  incluye: string;
  actual: boolean;
  etiquetaActual: string;
  destacado?: boolean;
  pie?: React.ReactNode;
  /** «−18% tu primer mes», cuando la promo ya está ganada (078). */
  nota?: string | null;
}) {
  return (
    <div className={`tarjeta flex flex-col p-5 ${destacado ? 'border-verde/50 ring-1 ring-verde/20' : ''}`}>
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-[16px] font-bold tracking-tight">{nombre}</h2>
        {actual && (
          <span className="pastilla bg-verde-claro text-verde-fuerte">{etiquetaActual}</span>
        )}
      </div>

      <p className="mt-3 flex items-baseline gap-1.5">
        <span className="text-[24px] font-titulo font-extrabold tracking-tight tabular-nums">{precio}</span>
        {porPeriodo && <span className="text-[13px] font-semibold text-tinta/45">{porPeriodo}</span>}
      </p>

      {nota && (
        <p className="mt-1.5 text-[12.5px] font-bold text-verde-fuerte">{nota}</p>
      )}

      <p className="mt-4 titulo-seccion">{incluye}</p>
      <ul className="mt-2 flex-1 space-y-2">
        {puntos.map((punto) => (
          <li key={punto} className="flex items-start gap-2 text-[13.5px] leading-snug text-tinta/70">
            <svg viewBox="0 0 24 24" className="mt-[3px] h-3.5 w-3.5 shrink-0 text-verde-fuerte"
                 fill="none" stroke="currentColor" strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round">
              <path d="m5 13 4 4L19 7" />
            </svg>
            {punto}
          </li>
        ))}
      </ul>

      {pie && <div className="mt-5">{pie}</div>}
    </div>
  );
}
