import Link from 'next/link';
import { contextoObligatorio } from '@/lib/sesion';
import { textos } from '@/i18n';
import { FICHA } from '@/i18n/idiomas';
import { conJerga } from '@/i18n/jergas';
import { fichaDe } from '@/lib/rubros';
import { precio as precioTexto } from '@/lib/formato';
import {
  LIMITES_VISIBLES, MONEDA_DE_REFERENCIA, PERSONAS_INCLUIDAS_PREMIUM, PLANES_PAGOS, mesesDeRegalo, monedaDeCobro,
  precioDe, traerPrecios, traerReferencia, type PlanPago,
} from '@/lib/precios';
import type { PeriodoCobro } from '@/lib/tipos';
import { SelectorCobro } from '@/components/SelectorCobro';
import { BotonSuscribirme, BotonCotizar } from '@/components/BotonSuscribirme';
import { BotonPagar } from '@/components/BotonPagar';
import { TarjetaRecomendar } from '@/components/TarjetaRecomendar';
import { clienteServidor } from '@/lib/supabase/servidor';
import { traerDescuentoRacha } from '@/lib/habito';
import { accesoBancard } from '@/lib/bancard-servidor';
import { HOST_BANCARD, urlDelScript } from '@/lib/bancard';
import { BotonPagarBancard } from '@/components/bancard/BotonPagarBancard';
import { PagoEnCurso } from '@/components/bancard/EstadoDelPago';
import { TarjetaGuardada, type DebitoVista, type TarjetaVista } from '@/components/bancard/TarjetaGuardada';
import { EquipoPremium } from '@/components/bancard/EquipoPremium';
import { BotonCambiarPlan } from '@/components/bancard/BotonCambiarPlan';
import { PieBajarDePlan, PieDelPlanActual } from '@/components/bancard/BajaDePlan';
import type { DatosDelCambio } from '@/components/bancard/HojaCambiarPlan';
import type { DatosDelPago } from '@/components/bancard/HojaPagar';
import type { MomentoDelDebito } from '@/components/bancard/tipos';

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
 * Desde la 110 (28/09/2026) eso vale para un negocio. La cuenta personal no
 * queda con candado: pasa al plan Gratis, y acá ve Gratis y Pro lado a lado.
 *
 * EL PRECIO VA SIEMPRE EN GUARANÍES, CON LOS DÓLARES AL LADO (23/09).
 * La suscripción se cobra solo en guaraníes (Bancard deja una sola moneda y
 * Matías eligió guaraníes), así que ya no hay selector Gs / US$: mostrar un
 * precio en dólares que después se cobra en guaraníes sería prometer una
 * cifra que no es la que se paga. Pero a quien piensa en dólares —un sojero,
 * un brasileño— un importe de seis cifras no le dice nada de entrada, así
 * que al lado va «≈ US$ 19» chico, de la fila en dólares del mismo plan y
 * período. Es referencia: no se cobra. Si esa fila no existe, no se muestra.
 */
export default async function PaginaPlan({
  searchParams: busqueda,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const searchParams = await busqueda;
  const ctx = await contextoObligatorio();
  const ficha = fichaDe(ctx.empresa.rubro, ctx.empresa.tipo_cuenta);
  // Con las palabras del oficio (102): al agricultor, «Vos solo, sin
  // encargados» y no «sin vendedores». Igual que las páginas del trainer.
  const t = conJerga(await textos(), ficha.jerga, ctx.idioma);
  const locale = FICHA[ctx.idioma].locale;

  // Siempre guaraníes. Un `?moneda=USD` de un enlace viejo ya no cambia nada.
  const moneda = monedaDeCobro();
  const periodo: PeriodoCobro = searchParams.periodo === 'anual' ? 'anual' : 'mensual';

  // La referencia en dólares no puede tumbar la pantalla donde se cobra: si
  // falla, vuelve vacía y los precios en guaraníes se ven igual.
  //
  // Lo mismo el precio de cada persona extra del Premium (050): se pide solo
  // si esta cuenta ve la tarjeta del Premium, y si falla la tarjeta lo dice
  // sin importe en vez de caerse.
  const vePremium = ctx.empresa.tipo_cuenta !== 'personal'
    && (ficha.planes.includes('negocio') || ctx.planEfectivo === 'negocio');
  const [precios, referencia, porPersona] = await Promise.all([
    traerPrecios(moneda, ctx.empresa.tipo_cuenta),
    traerReferencia(ctx.empresa.tipo_cuenta),
    vePremium
      ? Promise.resolve(clienteServidor().rpc('precio_por_vendedor', { p_moneda: moneda }))
        .then((r) => {
          const n = r.error || r.data == null ? NaN : Number(r.data);
          return Number.isFinite(n) && n > 0 ? n : null;
        })
        .catch(() => null)
      : Promise.resolve(null),
  ]);
  const sus = ctx.suscripcion;
  /**
   * LA CUENTA PERSONAL TIENE PLAN GRATIS (110, 28/09/2026).
   *
   * Al terminar la prueba (o el Pro) no queda con candado: pasa al Gratis y
   * sigue anotando a mano. Por eso a ella se le muestra Gratis al lado del
   * Pro mientras prueba o si ya está en Gratis, y sus textos dicen «pasás al
   * plan Gratis» y no «hace falta activar un plan». Un negocio no cambia.
   */
  const esPersonal = ctx.empresa.tipo_cuenta === 'personal';
  const conGratis = esPersonal && (sus.en_prueba || ctx.gratisPersonal);
  /**
   * QUÉ PLANES SE OFRECEN: LOS DE SU RUBRO (102).
   *
   * Un profe ve solo el Básico, el campo Básico y Pro, un comercio los tres
   * (077), y una cuenta personal su único plan pago. La lista vive en la
   * ficha del rubro (`planes`), espejo de `planes_de_rubro()` en la base.
   *
   * NUNCA SE LE QUITA NADA A NADIE. Si la cuenta ya está pagando un plan que
   * su rubro no ofrece —un profe que contrató Pro antes de esto—, esa
   * tarjeta sigue ahí, marcada como su plan actual. Durante la prueba no
   * cuenta: estar probando no es estar pagando (ver `esActual`, abajo).
   */
  const planPagado = !sus.en_prueba
    ? PLANES_PAGOS.find((p) => p === ctx.planEfectivo) ?? null
    : null;
  const planesVisibles: PlanPago[] = PLANES_PAGOS.filter(
    (p) => ficha.planes.includes(p) || p === planPagado,
  );

  // Si es momento de ofrecerle recomendar Orden. Las reglas están en la
  // base (062); acá solo se pregunta, y si falla no se ofrece nada.
  const momentoRecomendar = await Promise.resolve(
    clienteServidor().rpc('momento_de_recomendar', { p_empresa: ctx.empresa.id }),
  ).then((r) => (r.data as { pedir?: boolean } | null)?.pedir === true).catch(() => false);
  const uso = ctx.capturasIA;

  // El descuento que se gana cargando durante la prueba (078). Si falla, no
  // se muestra la promo y la pantalla sigue igual.
  // En el plan Gratis personal (110) no se gana un descuento nuevo: se
  // respeta el que ya se ganó. Mismo criterio que el panel: a un Pro pagado
  // que venció por fecha la base le sigue dando la constancia «vigente», y
  // le prometería un descuento que en Gratis no corre.
  const racha = await traerDescuentoRacha(ctx.empresa.id);
  const descuento = ctx.gratisPersonal && !racha?.logrado ? null : racha;

  // Mientras el cobro sea por transferencia, el camino es WhatsApp. Si algún
  // día se enchufa una pasarela, con quitar el número vuelve solo el botón de
  // pago: las dos rutas conviven sin tocar nada más.
  // `\D` es «todo lo que no sea un dígito». Sin la barra —como estuvo— la
  // expresión borra la letra D y deja espacios, signos y paréntesis, que
  // rompen el enlace de WhatsApp justo en la pantalla donde se cobra.
  const whatsapp = (process.env.NEXT_PUBLIC_WHATSAPP ?? '').replace(/\D/g, '') || null;

  /**
   * PAGAR CON TARJETA O QR, POR BANCARD (02/10/2026).
   *
   * Quién lo ve lo decide UN lugar (`accesoBancard`): Bancard configurado,
   * que administre la cuenta, y además la administración de Orden, una
   * cuenta habilitada desde /admin (la de prueba del certificador) o todos
   * cuando se abra (`BANCARD_ABIERTO`, solo en producción). Quien no lo ve,
   * ve lo de siempre: el WhatsApp. Si falla la consulta, no se ve.
   */
  const supabase = clienteServidor();
  const bancard = await accesoBancard(supabase, ctx.empresa.id);
  const entornoBancard = bancard.disponible ? bancard.entorno : null;
  const conPix = process.env.NEXT_PUBLIC_BANCARD_PIX === '1';
  const [estadoBancard, miembros] = entornoBancard
    ? await Promise.all([
        Promise.resolve(supabase.rpc('bancard_estado', { p_empresa: ctx.empresa.id, p_entorno: entornoBancard }))
          .then((r) => (r.error ? null : r.data as EstadoBancard | null))
          .catch(() => null),
        Promise.resolve(supabase.from('miembros').select('user_id', { count: 'exact', head: true }).eq('empresa_id', ctx.empresa.id))
          .then((r) => r.count ?? 1)
          .catch(() => 1),
      ])
    : [null, 1];
  const ahora = Date.now();
  const pagoVigente = sus.estado === 'activa' && !sus.en_prueba && !!sus.periodo_fin
    && new Date(sus.periodo_fin).getTime() > ahora && ctx.planEfectivo !== 'gratis';
  /**
   * Con días pagos, la tarjeta de OTRO plan no es un pago de plan: es un
   * cambio. Pagarlo entero por el botón de siempre lo frena la base («Tu
   * plan actual está pago hasta el…»).
   */
  const cambioConDiasPagos = (plan: PlanPago) => pagoVigente && ctx.planEfectivo !== plan;
  /**
   * CAMBIAR DE PLAN CON DÍAS PAGOS, POR BANCARD (migración 130, 07/10/2026).
   *
   * Matías: «Me suscribí al Básico. Si la persona quiere cambiar al Pro o al
   * Premium me lleva al WhatsApp. ¿No hay una forma de que se pueda pagar con
   * tarjeta o con QR?». Ahora, para un negocio que ve Bancard, en la tarjeta
   * del otro plan:
   *
   *   · MÁS ALTO: «Cambiar al Pro». Se paga hoy la diferencia entre los dos
   *     planes por los días que faltan; la fecha de renovación no cambia.
   *   · MÁS BAJO: «Bajar al Básico desde la renovación». No se paga ni se
   *     devuelve: se programa, y se deshace con un toque.
   *
   * El orden es fijo (Básico, Pro, Premium), el de `nivel_de_plan` en la
   * base. Quien no ve Bancard sigue con el WhatsApp; la cuenta personal
   * tiene un solo plan pago y no entra acá.
   */
  const NIVEL: Record<PlanPago, number> = { basico: 1, pro: 2, negocio: 3 };
  const planVigente = pagoVigente ? planPagado : null;
  const cambiaPorBancard = (plan: PlanPago) => !!entornoBancard && !esPersonal && planVigente !== null && cambioConDiasPagos(plan);
  /** El cambio se calcula, y la renovación se cobra, sobre el período que la cuenta ya tiene (no el del selector). */
  const periodoDeLaCuenta: PeriodoCobro = sus.periodo === 'anual' ? 'anual' : 'mensual';
  /**
   * La baja de plan programada para la próxima renovación, si la hay
   * (`bancard_estado`, 130). `enLaBase` es lo que cobra la renovación
   * también con el plan ya vencido; las tarjetas la muestran solo mientras
   * el plan está pago y vigente.
   */
  const planProgramadoEnLaBase = estadoBancard?.plan_proximo === 'basico' || estadoBancard?.plan_proximo === 'pro'
    ? estadoBancard.plan_proximo
    : null;
  const planProgramado = pagoVigente ? planProgramadoEnLaBase : null;
  /**
   * El plan programado se paga a mano solo los últimos días (la cuenta la
   * hace la base): pagarlo antes baja el plan en ese momento y la persona
   * pierde días que ya pagó.
   */
  const programadoPagable = estadoBancard?.plan_proximo_pagable === true;
  /** Un pago sin terminar: no se programa ni se deshace una baja hasta que se resuelva. */
  const pagoEnCurso = !!estadoBancard?.viva;
  /** Cuántas personas tiene hoy el equipo. */
  const equipoHoy = typeof estadoBancard?.miembros === 'number' ? estadoBancard.miembros : miembros;
  /**
   * EL EQUIPO TIENE QUE ENTRAR EN EL PLAN QUE SE PAGA (decisión 4, 130).
   *
   * Por Bancard no se puede pagar un plan con menos lugares que el equipo de
   * hoy (ni dejando vencer): la base frena el pago y dice qué hacer. Acá se
   * dice ANTES, en la tarjeta, en vez de ofrecer un botón que termina en un
   * error. El Premium se paga por cantidad de personas y su selector no baja
   * del equipo de hoy, así que siempre alcanza.
   */
  const noEntraElEquipo = (plan: PlanPago) => !!entornoBancard && !esPersonal && plan !== 'negocio'
    && equipoHoy > LIMITES_VISIBLES[plan].miembros;
  /** Con la cuenta vencida no se puede entrar a achicar el equipo (el candado solo deja ver esta pantalla). */
  const conCandado = !esPersonal && !sus.en_prueba && ctx.planEfectivo === 'gratis';
  const avisoDelEquipo = (plan: PlanPago) => (conCandado ? t.bancard.cambio.equipoNoEntraVencida : t.bancard.cambio.equipoNoEntra)(
    t.plan[plan], t.bancard.hoja.personas(LIMITES_VISIBLES[plan].miembros), equipoHoy,
  );
  /**
   * El Premium: con cuántas personas arranca el selector. Renovar un Premium
   * vigente que ya tiene cantidad es por esa cantidad (o la baja que
   * programó); si no, nunca menos que el equipo de hoy ni que las 4 que trae.
   */
  const personasDelPremium = (() => {
    const max = LIMITES_VISIBLES.negocio.miembros;
    const p = estadoBancard?.personas ?? null;
    if (pagoVigente && ctx.planEfectivo === 'negocio' && p && p.contratadas !== null) {
      return { inicial: Math.min(max, Math.max(p.proxima ?? p.contratadas, miembros, PERSONAS_INCLUIDAS_PREMIUM)), fijas: true };
    }
    return { inicial: Math.min(max, Math.max(PERSONAS_INCLUIDAS_PREMIUM, miembros, p?.contratadas ?? 0)), fijas: false };
  })();
  /** La tarjeta guardada de la cuenta (marca y últimos cuatro), si hay. */
  const tarjetaGuardada: TarjetaVista | null = estadoBancard?.tarjeta
    ? { id: estadoBancard.tarjeta.id, marca: estadoBancard.tarjeta.marca, ultimos4: estadoBancard.tarjeta.ultimos4 }
    : null;
  /** Lo que la ventana de pago necesita para cobrar ese plan en ese período. */
  const datosDelPago = (plan: PlanPago, esActual: boolean, periodoDelPago: PeriodoCobro): DatosDelPago | null => {
    if (!entornoBancard) return null;
    const conPersonas = plan === 'negocio' && !esPersonal;
    return {
      empresaId: ctx.empresa.id,
      plan,
      periodo: periodoDelPago,
      nombrePlan: t.plan[plan],
      entorno: entornoBancard,
      urlScript: urlDelScript(entornoBancard),
      origen: HOST_BANCARD[entornoBancard],
      personasInicial: conPersonas ? personasDelPremium.inicial : null,
      personasFijas: conPersonas && personasDelPremium.fijas,
      yaPagoHasta: esActual && pagoVigente ? sus.periodo_fin : null,
      zona: ctx.zonaHoraria,
      conPix,
      tarjeta: tarjetaGuardada,
    };
  };
  const pagoBancard = (plan: PlanPago, esActual: boolean) => {
    const datos = cambioConDiasPagos(plan) ? null : datosDelPago(plan, esActual, periodo);
    if (!datos) return null;
    const etiqueta = esActual
      ? (conPix ? t.bancard.boton.renovarConPix : t.bancard.boton.renovar)
      : (conPix ? t.bancard.boton.pagarConPix : t.bancard.boton.pagar);
    return <BotonPagarBancard etiqueta={etiqueta} datos={datos} />;
  };
  /**
   * El cobro automático al día: qué día sale solo el próximo cobro
   * ('AAAA-MM-DD'). Es el día anterior al vencimiento, y es cuando entra en
   * vigencia una baja programada (el plan cambia cuando entra el pago de la
   * renovación, no a la medianoche del vencimiento).
   */
  const fechaDelDebito = tarjetaGuardada && estadoBancard?.debito?.activo === true
    && estadoBancard.debito.estado === 'al_dia' && estadoBancard.debito.fecha_cobro
    ? estadoBancard.debito.fecha_cobro
    : null;
  /** «5 de noviembre» (con el año solo si no es este): desde cuándo rige lo programado. */
  const fechaDeRenovacion = (() => {
    const anioDeHoy = new Date(ahora).getUTCFullYear();
    if (fechaDelDebito) {
      const [a, m, d] = fechaDelDebito.slice(0, 10).split('-').map(Number);
      if (a && m && d) {
        return new Intl.DateTimeFormat(locale, {
          timeZone: 'UTC', day: 'numeric', month: 'long', ...(a !== anioDeHoy ? { year: 'numeric' as const } : {}),
        }).format(new Date(Date.UTC(a, m - 1, d)));
      }
    }
    if (!sus.periodo_fin) return '';
    const fin = new Date(sus.periodo_fin);
    return fin.toLocaleDateString(locale, {
      timeZone: ctx.zonaHoraria, day: 'numeric', month: 'long', ...(fin.getUTCFullYear() !== anioDeHoy ? { year: 'numeric' as const } : {}),
    });
  })();
  /**
   * Lo que la hoja de «Cambiar al Pro» necesita. NO lleva ningún importe ni
   * el período de la cuenta: la hoja se los pide a la base (`cotizar_cambio`)
   * y al pagar viaja solo a qué plan (y cuántas personas, si es el Premium).
   */
  const datosDelCambio = (plan: 'pro' | 'negocio'): DatosDelCambio | null => {
    if (!entornoBancard) return null;
    return {
      empresaId: ctx.empresa.id,
      plan,
      entorno: entornoBancard,
      urlScript: urlDelScript(entornoBancard),
      origen: HOST_BANCARD[entornoBancard],
      zona: ctx.zonaHoraria,
      conPix,
      // Nunca menos que las que trae el Premium ni que el equipo de hoy.
      personasInicial: plan === 'negocio'
        ? Math.min(LIMITES_VISIBLES.negocio.miembros, Math.max(PERSONAS_INCLUIDAS_PREMIUM, equipoHoy))
        : null,
      personasMax: LIMITES_VISIBLES.negocio.miembros,
      tarjeta: tarjetaGuardada,
      fechaDelDebito,
      // Subir cancela lo que estuviera programado (la baja de plan o la de personas).
      hayBajaProgramada: planProgramado !== null || (estadoBancard?.personas?.proxima ?? null) !== null,
      periodoElegido: periodo,
      conCartelDeDescuento: descuento?.logrado === true,
    };
  };
  /**
   * «Renovar con tarjeta o QR» del plan PROGRAMADO, en su tarjeta: solo
   * cuando ya se puede pagar a mano (los últimos días). Avisa que al pagar
   * el plan cambia en ese momento.
   */
  const renovarElProgramado = (plan: 'basico' | 'pro') => {
    if (!programadoPagable || noEntraElEquipo(plan)) return null;
    const datos = datosDelPago(plan, true, periodo);
    if (!datos) return null;
    return (
      <BotonPagarBancard
        etiqueta={conPix ? t.bancard.boton.renovarConPix : t.bancard.boton.renovar}
        datos={{ ...datos, aviso: t.bancard.cambio.alPagarCambia(t.plan[plan]) }}
      />
    );
  };
  /**
   * La tarjeta guardada y su «Cobrar ahora»: cobra lo que cobraría la
   * renovación, en el período de la cuenta: el plan que paga (o pagó), o el
   * que programó para la renovación. Sin plan pago, el botón no se ofrece:
   * se elige un plan en su tarjeta. Con una baja programada tampoco se
   * ofrece hasta los últimos días: todavía no hay nada que cobrar, y pagarla
   * antes le sacaría a la persona días del plan que ya pagó.
   */
  const planDelDebito = !esPersonal || ctx.planEfectivo !== 'gratis'
    ? PLANES_PAGOS.find((p) => p === sus.plan) ?? null
    : null;
  const planACobrar: PlanPago | null = planDelDebito ? (planProgramadoEnLaBase ?? planDelDebito) : null;
  const renovacionDelDebito = ((): DatosDelPago | null => {
    if (!planACobrar || sus.en_prueba) return null;
    if (planProgramadoEnLaBase !== null && !programadoPagable) return null;
    const datos = datosDelPago(planACobrar, true, periodoDeLaCuenta);
    if (!datos || planProgramado === null) return datos;
    return { ...datos, aviso: t.bancard.cambio.alPagarCambia(t.plan[planACobrar]) };
  })();
  /**
   * ¿Se le cobra sola si guarda la tarjeta? Solo con un plan pago activo: es
   * la misma condición de la base (`bancard_tomar_cobro`, 125). En la prueba
   * —vigente o ya terminada— la tarjeta queda guardada y no se cobra sola
   * (decisión del 07/10/2026), y la pantalla no puede prometer otra cosa.
   */
  const momentoDelDebito: MomentoDelDebito = sus.estado === 'activa' && sus.plan !== 'gratis' ? 'activa'
    : sus.en_prueba ? 'prueba'
    : 'sin_plan';

  const regalo = mesesDeRegalo(precioDe(precios, 'pro', 'mensual'), precioDe(precios, 'pro', 'anual'));
  // Las columnas cuentan la tarjeta Gratis de la personal.
  const columnas = planesVisibles.length + (conGratis ? 1 : 0);

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <header>
        <h1 className="text-[22px] font-titulo font-extrabold tracking-tight">{t.plan.titulo}</h1>
      </header>

      {/* ---------------- Dónde está parada la persona ---------------- */}
      {sus.en_prueba && (
        <div className="tarjeta border-verde/40 bg-verde-claro/50 p-4">
          <p className="text-[15px] font-bold text-verde-fuerte">
            {esPersonal ? t.planGratis.plan.enPrueba : t.plan.enPrueba}
          </p>
          <p className="mt-1 text-[14px] font-semibold">{t.plan.diasDePrueba(sus.dias_restantes)}</p>
          <p className="mt-1.5 text-[13px] leading-relaxed text-tinta/60">
            {esPersonal ? t.planGratis.plan.pruebaVence : t.plan.pruebaVence}
          </p>
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

      {/* La personal en Gratis no está vencida: está en un plan que anda.
          Verde suave, no ámbar. El ámbar queda para el negocio vencido. */}
      {ctx.gratisPersonal ? (
        <div className="tarjeta border-verde/40 bg-verde-claro/50 p-4">
          <p className="text-[15px] font-bold text-verde-fuerte">{t.planGratis.plan.gratisTitulo}</p>
          <p className="mt-1.5 text-[13px] leading-relaxed text-tinta/60">{t.planGratis.plan.gratisDetalle}</p>
        </div>
      ) : !sus.en_prueba && ctx.planEfectivo === 'gratis' && sus.ya_uso_prueba && (
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
        periodo={periodo}
        etiquetaMensual={t.plan.mensual}
        etiquetaAnual={t.plan.anual}
        etiquetaAhorro={regalo > 0 ? t.plan.ahorroAnual(regalo) : ''}
      />

      {/* Mientras Bancard está en pruebas: que la administración sepa que
          esto no lo ve nadie más, y que en staging no se cobra plata real. */}
      {entornoBancard && (
        (bancard.superadmin && !bancard.habilitada && !(bancard.abierto && entornoBancard === 'produccion'))
        || entornoBancard === 'staging'
      ) && (
        <div className="flex flex-wrap gap-2">
          {bancard.superadmin && !bancard.habilitada && !(bancard.abierto && entornoBancard === 'produccion') && (
            <span className="pastilla bg-ambar-claro text-ambar">{t.bancard.pruebas.soloVos}</span>
          )}
          {entornoBancard === 'staging' && (
            <span className="pastilla bg-arena text-tinta/70">{t.bancard.pruebas.ambienteDePrueba}</span>
          )}
        </div>
      )}

      {/* Un pago que quedó sin confirmar (cerró la ventana, o pagó con QR y
          volvió): se pregunta un rato y, si entró, se refresca la pantalla. */}
      {estadoBancard?.viva && entornoBancard && (
        <PagoEnCurso
          operacion={estadoBancard.viva.operacion}
          estado={estadoBancard.viva.estado}
          tresDs={estadoBancard.viva.puede_3ds
            ? { entorno: entornoBancard, urlScript: urlDelScript(entornoBancard), origen: HOST_BANCARD[entornoBancard] }
            : null}
        />
      )}

      {/* ---------------- Los planes ----------------
          Para un negocio no aparece una tarjeta «Gratis»: Gratis es cuenta
          vencida y no se puede usar nada de Orden. Ofrecerlo como si fuera
          una opción era invitar a elegir el estado de «no poder trabajar».
          Para la personal (110, 28/09/2026) Gratis es un plan que anda, y se
          muestra junto al Pro mientras prueba o si ya está en Gratis. */}
      <div className={`grid gap-4 ${columnas === 1 ? 'sm:max-w-md' : columnas === 2 ? 'md:grid-cols-2' : 'md:grid-cols-3'}`}>
        {conGratis && (
          <Tarjeta
            nombre={t.plan.gratis}
            precio={precioTexto(0, moneda, locale)}
            porPeriodo={periodo === 'anual' ? `/ ${t.plan.porAnio}` : `/ ${t.plan.porMes}`}
            puntos={t.planGratis.plan.gratisPuntos}
            actual={ctx.gratisPersonal}
            etiquetaActual={t.plan.actual}
            incluye={t.plan.incluye}
            pie={null}
          />
        )}
        {planesVisibles.map((plan) => {
          const precio = precioDe(precios, plan, periodo);
          const enDolares = precioDe(referencia, plan, periodo);
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

          // «Prefiero pagar por transferencia»: el WhatsApp de siempre, en chico.
          const transferencia = !whatsapp ? null : plan === 'negocio' && ctx.empresa.tipo_cuenta === 'emprendedor' ? (
            <BotonCotizar
              whatsapp={whatsapp}
              empresa={ctx.empresa.nombre}
              etiqueta={t.bancard.boton.prefieroTransferir}
              comoEnlace
            />
          ) : (
            <BotonSuscribirme
              whatsapp={whatsapp}
              empresa={ctx.empresa.nombre}
              plan={t.plan[plan]}
              precio={precio ? precioTexto(Number(precio.importe), moneda, locale) : ''}
              periodo={periodo}
              etiqueta={t.bancard.boton.prefieroTransferir}
              esPersonal={esPersonal}
              comoEnlace
            />
          );

          /**
           * EL PIE DE LA TARJETA, por orden:
           *
           *   1. UN CAMBIO DE PLAN CON DÍAS PAGOS, por Bancard (130): a un
           *      plan más alto, «Cambiar al Pro» (se paga hoy la diferencia);
           *      a uno más bajo, «Bajar al Básico desde la renovación» (se
           *      programa). Acá no va la transferencia: el WhatsApp queda
           *      como contacto adentro de cada hoja.
           *   2. CON BANCARD: el botón de pagar (también en el plan actual,
           *      para renovar) y, si hay WhatsApp, la transferencia en chico.
           *      Si el equipo de hoy no entra en ese plan, en vez del botón va
           *      el porqué (decisión 4). En el plan actual con una baja
           *      programada, «Seguir con el Pro» en vez de «Renovar».
           *   3. SIN BANCARD: el WhatsApp de siempre, o el botón de la pasarela.
           */
          const botonBancard = pagoBancard(plan, esActual);
          let pie: React.ReactNode = null;
          if (cambiaPorBancard(plan) && planVigente !== null) {
            if (plan !== 'basico' && NIVEL[plan] > NIVEL[planVigente]) {
              const cambio = datosDelCambio(plan);
              pie = noEntraElEquipo(plan) ? (
                <p className="text-[13px] leading-relaxed text-tinta/65">{avisoDelEquipo(plan)}</p>
              ) : cambio ? (
                <BotonCambiarPlan etiqueta={t.bancard.cambio.subir(t.plan[plan])} datos={cambio} />
              ) : null;
            } else if (plan !== 'negocio' && planVigente !== 'basico') {
              pie = (
                <PieBajarDePlan
                  empresaId={ctx.empresa.id}
                  plan={plan}
                  planActual={planVigente}
                  programado={planProgramado === plan}
                  fecha={fechaDeRenovacion}
                  periodo={periodoDeLaCuenta}
                  lugares={limites.miembros}
                  capturas={limites.capturas}
                  miembros={equipoHoy}
                  enCurso={pagoEnCurso}
                  bajaDePersonas={estadoBancard?.personas?.proxima ?? null}
                >
                  {planProgramado === plan ? renovarElProgramado(plan) : null}
                </PieBajarDePlan>
              );
            }
          } else if (botonBancard) {
            const deSiempre = (
              <div className="space-y-1.5">
                {noEntraElEquipo(plan)
                  ? <p className="text-[13px] leading-relaxed text-tinta/65">{avisoDelEquipo(plan)}</p>
                  : botonBancard}
                {transferencia}
              </div>
            );
            pie = esActual && pagoVigente && !esPersonal ? (
              <PieDelPlanActual
                empresaId={ctx.empresa.id}
                plan={plan}
                programado={planProgramado !== null}
                enCurso={pagoEnCurso}
              >
                {deSiempre}
              </PieDelPlanActual>
            ) : deSiempre;
          } else if (esActual) {
            pie = null;
          } else if (whatsapp) {
            // Premium se cotiza: el precio depende de cuántos vendedores,
            // así que se manda la pregunta y no un número.
            pie = plan === 'negocio' && ctx.empresa.tipo_cuenta === 'emprendedor' ? (
              <BotonCotizar whatsapp={whatsapp} empresa={ctx.empresa.nombre} />
            ) : (
              <BotonSuscribirme
                whatsapp={whatsapp}
                empresa={ctx.empresa.nombre}
                plan={t.plan[plan]}
                precio={precio ? precioTexto(Number(precio.importe), moneda, locale) : ''}
                periodo={periodo}
                etiqueta={sus.en_prueba ? t.plan.activarEstePlan : t.plan.suscribirme}
                esPersonal={esPersonal}
              />
            );
          } else {
            pie = (
              <BotonPagar
                plan={plan}
                periodo={periodo}
                etiqueta={t.plan.elegir}
                sinPasarela={t.plan.pagoNoDisponible}
              />
            );
          }

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
              referencia={precio && enDolares
                ? t.plan.referenciaEnDolares(precioTexto(Number(enDolares.importe), MONEDA_DE_REFERENCIA, locale))
                : null}
              ayudaReferencia={t.plan.referenciaEnDolaresAyuda}
              porPeriodo={periodo === 'anual' ? `/ ${t.plan.porAnio}` : `/ ${t.plan.porMes}`}
              actual={esActual}
              etiquetaActual={t.plan.actual}
              incluye={t.plan.incluye}
              puntos={
                esPersonal
                  // Lo que suma el Pro sobre el Gratis (110), con el tope
                  // real de capturas: «sin tope» no era cierto.
                  ? [
                      t.planGratis.plan.proCargas(limites.capturas),
                      t.planGratis.plan.proPresupuesto,
                      t.plan.soloVos,
                      t.planGratis.plan.proMeDebenYBilletera,
                      t.plan.conAdjuntos,
                      t.planGratis.plan.proReportes,
                    ]
                  : plan === 'basico'
                    ? [
                        // El Básico no recorta el negocio: recorta la gente.
                        t.plan.todoElNegocio,
                        t.plan.soloUnaPersona,
                        t.plan.capturasMes(limites.capturas),
                        t.plan.conExcel,
                      ]
                    : plan === 'negocio'
                      // EL PREMIUM, DICHO ENTERO (123, 02/10/2026): cuántas
                      // personas trae su precio y cuánto suma cada una de
                      // más. Decía solo «Hasta 15 personas».
                      ? [
                          t.plan.capturasLibres,
                          t.plan.premiumIncluye(PERSONAS_INCLUIDAS_PREMIUM),
                          t.plan.premiumPorPersona(
                            porPersona !== null ? precioTexto(porPersona, moneda, locale) : null,
                            limites.miembros,
                          ),
                          t.plan.conAdjuntos,
                          t.plan.conExcel,
                        ]
                      : [
                          t.plan.capturasLibres,
                          t.plan.personas(limites.miembros),
                          t.plan.conAdjuntos,
                          t.plan.conExcel,
                        ]
              }
              /* La baja programada se ve desde arriba: en qué plan queda. */
              pastilla={planProgramado === plan ? t.bancard.cambio.pastilla : null}
              pie={pie}
            />
          );
        })}
      </div>

      {/* Pegada a los precios: quien tiene una tarjeta de otro país tiene
          que saber ANTES de elegir que se le cobra en guaraníes. */}
      <p className="text-[12.5px] leading-relaxed text-tinta/55">{t.plan.cobroEnGuaranies}</p>

      {/* La tarjeta guardada para el cobro automático (Bancard, 02/10): cuál
          es, cuándo es el próximo cobro, cambiarla o quitarla. Solo quien
          administra la cuenta llega acá con Bancard disponible. */}
      {entornoBancard && estadoBancard && (
        <TarjetaGuardada
          empresaId={ctx.empresa.id}
          entorno={entornoBancard}
          urlScript={urlDelScript(entornoBancard)}
          origen={HOST_BANCARD[entornoBancard]}
          zona={ctx.zonaHoraria}
          anual={(renovacionDelDebito?.periodo ?? (planProgramadoEnLaBase ? periodoDeLaCuenta : periodo)) === 'anual'}
          momento={momentoDelDebito}
          tarjeta={tarjetaGuardada}
          debito={estadoBancard.debito}
          renovacion={renovacionDelDebito}
        />
      )}

      {/* El equipo de un Premium pago por Bancard con cantidad (02/10):
          sumar personas se paga hoy, prorrateado; bajar rige desde la
          próxima renovación. Un Premium «sin número» (activado a mano) no
          tiene esto: primero renueva eligiendo cuántas son. */}
      {entornoBancard && estadoBancard?.personas && estadoBancard.personas.contratadas !== null
        && pagoVigente && ctx.planEfectivo === 'negocio' && !esPersonal && (
        <EquipoPremium
          datos={{
            empresaId: ctx.empresa.id,
            entorno: entornoBancard,
            urlScript: urlDelScript(entornoBancard),
            origen: HOST_BANCARD[entornoBancard],
            zona: ctx.zonaHoraria,
            conPix,
            periodo: sus.periodo === 'anual' ? 'anual' : 'mensual',
            tarjeta: tarjetaGuardada,
          }}
          personas={{ ...estadoBancard.personas, contratadas: estadoBancard.personas.contratadas }}
          renovacion={sus.periodo_fin}
          bloqueado={planProgramado !== null}
        />
      )}

      {/* Va con los precios porque es parte de la cuenta: el que está
          mirando cuánto le sale tiene que saber que puede recuperar parte
          trayendo a otro. Está en todos los planes, también en la prueba. */}
      <Link
        href="/recomendar"
        className="flex items-center justify-between gap-3 rounded-2xl border border-verde/30 bg-verde-claro/30 p-4 transition hover:bg-verde-claro/50"
      >
        {/* En Gratis no hay lo que «bajar»: se gana plata invitando (110). */}
        <span className="min-w-0">
          <span className="block text-[14.5px] font-bold">
            {ctx.gratisPersonal ? t.planGratis.plan.podesGanar : t.plan.podesBajar}
          </span>
          <span className="mt-0.5 block text-[13px] leading-relaxed text-tinta/65">
            {ctx.gratisPersonal ? t.planGratis.plan.podesGanarDetalle : t.plan.podesBajarDetalle}
          </span>
        </span>
        <span className="shrink-0 text-[13px] font-semibold text-verde-fuerte">{t.plan.ver}</span>
      </Link>

      {entornoBancard ? (
        <div className="tarjeta p-4">
          <p className="titulo-seccion mb-1.5">{t.pantallas.comoSePaga}</p>
          <p className="text-[13.5px] leading-relaxed text-tinta/65">
            {conPix ? t.bancard.comoSePagaConPix : t.bancard.comoSePaga}
          </p>
        </div>
      ) : whatsapp && (
        <div className="tarjeta p-4">
          <p className="titulo-seccion mb-1.5">{t.pantallas.comoSePaga}</p>
          <p className="text-[13.5px] leading-relaxed text-tinta/65">
            {ctx.gratisPersonal ? t.planGratis.plan.comoSePagaDetalle : t.pantallas.comoSePagaDetalle}
          </p>
        </div>
      )}

      <p className="text-center text-[12.5px] font-semibold text-tinta/40">
        {t.plan.sinTarjeta} · {t.plan.cancelarCuando}
      </p>
    </div>
  );
}

/** Lo que usa esta pantalla de `bancard_estado` (125; las tres últimas, de la 130). */
interface EstadoBancard {
  tarjeta: { id: number; marca: string | null; ultimos4: string | null; tipo: string | null } | null;
  debito: DebitoVista;
  personas: { contratadas: number | null; proxima: number | null; miembros: number; min: number; max: number } | null;
  viva: { operacion: number; estado: string; tipo: string; medio: string; importe: number; minutos: number; puede_3ds: boolean } | null;
  /** El plan programado para la próxima renovación (una baja), o null. */
  plan_proximo?: string | null;
  /** Si ese plan ya se puede pagar a mano: faltan pocos días, o venció. */
  plan_proximo_pagable?: boolean;
  /** Cuántas personas tiene hoy el equipo, con cualquier plan. */
  miembros?: number;
}

function Tarjeta({
  nombre, precio, porPeriodo, puntos, incluye, actual, etiquetaActual, destacado = false, pie = null, nota = null,
  referencia = null, ayudaReferencia = '', pastilla = null,
}: {
  nombre: string;
  precio: string;
  /** «≈ US$ 19»: la referencia en dólares. No se cobra; sin fila, null. */
  referencia?: string | null;
  ayudaReferencia?: string;
  porPeriodo: string;
  puntos: string[];
  incluye: string;
  actual: boolean;
  etiquetaActual: string;
  destacado?: boolean;
  pie?: React.ReactNode;
  /** «−18% tu primer mes» (−5% en la cuenta personal, 123), cuando la promo ya está ganada (078). */
  nota?: string | null;
  /** «Desde la próxima renovación»: el plan que quedó programado (130). */
  pastilla?: string | null;
}) {
  return (
    <div className={`tarjeta flex flex-col p-5 ${destacado ? 'border-verde/50 ring-1 ring-verde/20' : ''}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-[16px] font-bold tracking-tight">{nombre}</h2>
        {actual && (
          <span className="pastilla bg-verde-claro text-verde-fuerte">{etiquetaActual}</span>
        )}
        {pastilla && (
          <span className="pastilla bg-ambar-claro text-ambar">{pastilla}</span>
        )}
      </div>

      <p className="mt-3 flex flex-wrap items-baseline gap-x-1.5">
        <span className="text-[24px] font-titulo font-extrabold tracking-tight tabular-nums">{precio}</span>
        {porPeriodo && <span className="text-[13px] font-semibold text-tinta/45">{porPeriodo}</span>}
        {referencia && (
          <span className="text-[12.5px] font-semibold tabular-nums text-tinta/40" title={ayudaReferencia}>
            {referencia}
          </span>
        )}
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
