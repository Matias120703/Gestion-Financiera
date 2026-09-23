import Link from 'next/link';
import { redirect } from 'next/navigation';
import type { Metadata } from 'next';
import { clienteServidor } from '@/lib/supabase/servidor';
import { precio } from '@/lib/formato';
import { textos, idiomaActual } from '@/i18n';
import Demos from '@/components/Demos';
import { Marca } from '@/components/Marca';
import { BotonTema } from '@/components/BotonTema';
import { GuiaInstalar } from '@/components/GuiaInstalar';
import { Rico } from '@/components/Rico';
import { HAY_DEMOS } from '@/lib/demos';
import { FICHA } from '@/i18n/idiomas';
import type { Precio } from '@/lib/tipos';
import { DIAS_DE_PRUEBA, MONEDA_DE_REFERENCIA, monedaDeCobro } from '@/lib/precios';

export const dynamic = 'force-dynamic';

/** El título y la descripción, en el idioma de quien abre la portada. */
export async function generateMetadata(): Promise<Metadata> {
  const t = await textos();
  return {
    title: t.portada.metaTitulo,
    description: t.portada.metaDescripcion,
    openGraph: {
      title: t.portada.metaTitulo,
      description: t.portada.metaDescripcionCorta,
      type: 'website',
    },
  };
}

/**
 * LA PORTADA
 *
 * Antes, `/` redirigía derecho al panel. Para quien ya tiene cuenta estaba
 * bien; para todos los demás significaba caer en un formulario de login de un
 * producto del que nunca escucharon. Si le mandás el link a un comerciante,
 * esto es lo único que va a leer antes de decidir.
 *
 * Cuatro reglas al escribirla:
 *
 *   · HABLA DEL PROBLEMA, NO DE LA TECNOLOGÍA. A nadie le importa que use
 *     IA. Le importa no saber cuánto ganó este mes.
 *   · LOS PRECIOS SALEN DE LA BASE. Si cambian en la tabla `precios`, esta
 *     página los muestra actualizados sin desplegar nada. Un precio escrito
 *     a mano acá sería el primero en quedar viejo y mentirle a alguien.
 *   · DOS PÚBLICOS, UN SOLO PRODUCTO. Orden atiende a un comercio y a alguien
 *     que lleva sus finanzas personales. La portada tiene que dejar clarísimo
 *     cuál es cuál ANTES de mostrar un precio: si alguien elige mal, se
 *     encuentra con pantallas que no le sirven y se va pensando que el
 *     producto está mal hecho.
 *   · QUIEN YA ENTRÓ NO LA VE. Se lo manda derecho al panel.
 *
 * Sobre el orden: el negocio va primero y ocupa más lugar. No es capricho,
 * es que paga el triple y es donde está la demanda probada. La cuenta
 * personal está bien explicada, pero no le pelea el lugar principal.
 *
 * Los textos viven en el diccionario (`portada`), en español y en portugués.
 * Acá solo queda la estructura.
 */
export default async function Portada() {
  // Con sesión, esta página no aporta nada: al panel.
  const supabase = clienteServidor();
  const { data: { user } } = await supabase.auth.getUser();
  if (user) redirect('/panel');

  const t = await textos();
  const p = t.portada;
  const idioma = await idiomaActual();
  const locale = FICHA[idioma].locale;

  // «8 días» / «8 dias»: el número sale de las constantes, la palabra del idioma.
  const diasNegocio = p.dias(DIAS_DE_PRUEBA.emprendedor);
  const diasPersonal = p.dias(DIAS_DE_PRUEBA.personal);

  /**
   * En qué moneda se muestran los precios: SIEMPRE EN GUARANÍES (23/09).
   *
   * La suscripción se cobra solo en guaraníes (Bancard deja una sola moneda
   * y Matías eligió guaraníes). Hasta acá había un selector Gs / US$ con
   * `?moneda=`; se sacó, porque mostrar en grande un precio en dólares que
   * después se cobra en guaraníes es prometer una cifra que no es la que se
   * paga. Para quien piensa en dólares queda la referencia chica «≈ US$ 19»
   * al lado de cada precio: se muestra, no se cobra.
   *
   * El selector había nacido por algo que sigue siendo cierto: Orden no es
   * solo para Paraguay, y a alguien de afuera un importe de seis cifras no
   * le dice nada. Eso lo resuelve ahora la referencia en dólares, sin
   * ofrecer una moneda en la que no se cobra. Un enlace viejo con
   * `?moneda=USD` sigue abriendo la portada, en guaraníes.
   */
  const moneda = monedaDeCobro();

  // Si la lectura de precios falla, la portada igual se muestra: mejor una
  // página sin la tabla de precios que un error para alguien que todavía no
  // sabe qué es esto. Se piden todas las monedas en una sola lectura
  // (`p_moneda` en null): los guaraníes, que es lo que se cobra, y los
  // dólares, que van al lado como referencia.
  const { data } = await supabase.rpc('lista_precios', { p_moneda: null });
  const todos = (Array.isArray(data) ? data : []) as Precio[];
  const precios = todos.filter((x) => x.moneda === moneda);
  const referencia = todos.filter((x) => x.moneda === MONEDA_DE_REFERENCIA);

  const buscar = (lista: Precio[], tipo: string, plan: string, periodo: string) =>
    lista.find((x) => x.tipo_cuenta === tipo && x.plan === plan && x.periodo === periodo) ?? null;
  const precioDe = (tipo: string, plan: string, periodo = 'mensual') => buscar(precios, tipo, plan, periodo);

  const importe = (x: Precio | null) =>
    x ? precio(Number(x.importe), moneda, locale) : '—';

  /**
   * «≈ US$ 19», de la fila en dólares del MISMO público, plan y período.
   * Solo si hay precio en guaraníes al lado (una referencia sin el precio
   * de verdad sería mostrar lo que no se cobra) y si la fila existe.
   */
  const enDolares = (x: Precio | null) => {
    const r = x ? buscar(referencia, x.tipo_cuenta, x.plan, x.periodo) : null;
    return r ? t.plan.referenciaEnDolares(precio(Number(r.importe), MONEDA_DE_REFERENCIA, locale)) : undefined;
  };

  const personalMes = precioDe('personal', 'pro');
  const personalAnio = precioDe('personal', 'pro', 'anual');
  const basicoMes = precioDe('emprendedor', 'basico');
  const basicoAnio = precioDe('emprendedor', 'basico', 'anual');
  const proMes = precioDe('emprendedor', 'pro');
  const proAnio = precioDe('emprendedor', 'pro', 'anual');
  const premiumMes = precioDe('emprendedor', 'negocio');

  /**
   * Los números de la promo de la racha (078) salen de `ajustes_orden`, que
   * es donde se editan sin desplegar. Si la lectura falla quedan los de por
   * defecto: decir un número equivocado sería peor que no decirlo.
   */
  const { data: promo } = await supabase.rpc('promo_de_la_prueba');
  const descuentoPct = Math.round(Number((promo as { porcentaje?: number } | null)?.porcentaje ?? 18));
  const constanciaPct = Math.round(Number((promo as { constancia_porcentaje?: number } | null)?.constancia_porcentaje ?? 5));
  const constanciaDias = Number((promo as { constancia_dias?: number } | null)?.constancia_dias ?? 30);
  const rachaNegocio = Number((promo as { negocio?: number } | null)?.negocio ?? 8);
  const rachaPersonal = Number((promo as { personal?: number } | null)?.personal ?? 5);

  const { data: porVendedor } = await supabase.rpc('precio_por_vendedor', { p_moneda: moneda });
  const vendedorExtra = porVendedor != null
    ? precio(Number(porVendedor), moneda, locale)
    : null;

  /** «Dos meses gratis» solo se dice si los números lo sostienen. */
  const mesesGratis = (mes: Precio | null, anio: Precio | null) => {
    if (!mes || !anio || Number(mes.importe) <= 0) return 0;
    return Math.max(0, Math.round(12 - Number(anio.importe) / Number(mes.importe)));
  };
  const ahorroPersonal = mesesGratis(personalMes, personalAnio);
  const ahorroPro = mesesGratis(proMes, proAnio);
  const ahorroBasico = mesesGratis(basicoMes, basicoAnio);

  return (
    <main className="min-h-screen bg-superficie">

      {/* ================================================================
          LA PRIMERA PANTALLA
          ================================================================

          Es lo único que mucha gente va a ver. Va en oscuro y el resto de la
          página en claro, a propósito:

            · el oscuro da el golpe de entrada y hace que la captura del
              producto —que es clara— salte a la vista en vez de fundirse con
              el fondo, como pasaba antes;
            · y de ahí para abajo vuelve el claro, que es como se ve Orden por
              dentro de verdad. Una portada entera en negro sobre una
              aplicación blanca promete algo que después no aparece.

          El fondo NO es negro: es el mismo verde de la marca bajado hasta el
          fondo (`noche`), para que las dos mitades se sientan del mismo
          producto y no de dos sitios distintos pegados. */}
      <section className="relative overflow-hidden bg-noche text-white">
        {/* Los resplandores. Van detrás de todo y no capturan el mouse. */}
        <div aria-hidden className="pointer-events-none absolute inset-0">
          <div
            className="absolute -left-24 -top-40 h-[34rem] w-[34rem] rounded-full opacity-70 blur-3xl"
            style={{ background: 'radial-gradient(circle, rgba(40,180,100,.55) 0%, rgba(40,180,100,0) 70%)' }}
          />
          <div
            className="absolute -right-32 top-24 h-[30rem] w-[30rem] rounded-full opacity-50 blur-3xl"
            style={{ background: 'radial-gradient(circle, rgba(61,220,154,.30) 0%, rgba(61,220,154,0) 70%)' }}
          />
          {/* Una cuadrícula apenas visible: da textura sin llamar la atención. */}
          <div
            className="absolute inset-0 opacity-[0.055]"
            style={{
              backgroundImage:
                'linear-gradient(to right, #fff 1px, transparent 1px),'
                + 'linear-gradient(to bottom, #fff 1px, transparent 1px)',
              backgroundSize: '56px 56px',
              maskImage: 'radial-gradient(ellipse 90% 60% at 50% 0%, #000 40%, transparent 100%)',
              WebkitMaskImage: 'radial-gradient(ellipse 90% 60% at 50% 0%, #000 40%, transparent 100%)',
            }}
          />
        </div>

        {/* ---------------- Barra ---------------- */}
        <header className="zona-segura-arriba relative">
          <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-4">
            <div className="flex items-center gap-2.5">
              <Marca clase="h-9 w-9" sobreOscuro />
              {/* En los teléfonos más angostos (menos de 360 px) la palabra se
                  esconde y queda el ícono: con «Instalar», los colores y
                  «Entrar», no entraba todo y se pisaban. */}
              <span className="hidden text-[17px] font-bold tracking-tight min-[360px]:inline">Orden</span>
            </div>
            <div className="flex items-center gap-3 sm:gap-5">
              {/* Visible también en el celular, a diferencia de «Precios»: esta
                  guía es justamente para quien está mirando desde un teléfono,
                  y ahí la sección queda al final de una página muy larga. */}
              <a href="#instalar" className="text-[13.5px] font-semibold text-white/60 transition hover:text-white">
                {p.instalar}
              </a>
              <a href="#precios" className="hidden text-[13.5px] font-semibold text-white/60 transition hover:text-white sm:block">
                {p.precios}
              </a>
              <BotonTema />
              <Link
                href="/ingresar"
                className="rounded-xl border border-white/15 bg-white/5 px-4 py-2 text-[13.5px] font-semibold
                           text-white backdrop-blur transition hover:border-white/30 hover:bg-white/10"
              >
                {p.entrar}
              </Link>
            </div>
          </div>
        </header>

        {/* ---------------- El titular y el producto ---------------- */}
        <div className="relative mx-auto max-w-6xl px-5 pb-16 pt-10 lg:pb-24 lg:pt-16">
          <div className="grid items-center gap-14 lg:grid-cols-[1.05fr_1fr]">
            <div>
              {/* Acá iba una pastilla de «Hecho en Paraguay». Se sacó: lo
                  primero que se lee tiene que ser la pregunta, no una
                  credencial. Sin ella el titular arranca más arriba y pega
                  más fuerte, que es todo lo que tiene que hacer. */}
              <h1 className="text-[38px] font-titulo font-extrabold leading-[1.05] tracking-tight sm:text-[46px] lg:text-[58px]">
                {p.titular1}<br />
                {p.titular2}{' '}
                <span className="bg-gradient-to-r from-menta to-menta-suave bg-clip-text text-transparent">
                  {p.titularResaltado}
                </span>
                {p.titularCierre}
              </h1>

              <p className="mt-6 max-w-xl text-[17px] leading-relaxed text-white/65 lg:text-[19px]">
                <Rico texto={p.bajada} negrita="font-semibold text-white" />
              </p>

              <div className="mt-9 flex flex-wrap items-center gap-3">
                <Link
                  href="/crear"
                  className="rounded-xl bg-menta px-6 py-3.5 text-[15px] font-bold text-noche shadow-lg
                             shadow-menta/20 transition hover:bg-menta-suave"
                >
                  {p.probarGratis(diasNegocio)}
                </Link>
                <a
                  href="#formas"
                  className="rounded-xl border border-white/15 px-6 py-3.5 text-[15px] font-semibold
                             text-white/85 transition hover:border-white/35 hover:text-white"
                >
                  {p.verComoFunciona}
                </a>
              </div>

              <p className="mt-5 text-[13.5px] font-medium text-white/45">
                {p.garantias}
              </p>
            </div>

            {/* El producto. No es una captura ni un dibujo: es la pantalla de
                verdad, con números de ejemplo, montada dentro de un marco. Lo
                que se ve acá es literalmente lo que se ve al entrar. */}
            <div className="relative mx-auto w-full max-w-[320px] lg:max-w-[360px]">
              <div
                aria-hidden
                className="absolute -inset-8 rounded-[3rem] opacity-60 blur-2xl"
                style={{ background: 'radial-gradient(circle, rgba(61,220,154,.28) 0%, rgba(61,220,154,0) 70%)' }}
              />
              <div className="relative rounded-[2.4rem] border border-white/12 bg-white/[.06] p-2.5 shadow-2xl backdrop-blur-sm">
                <div className="overflow-hidden rounded-[1.9rem] bg-arena">
                  {/* barra de la app */}
                  <div className="flex items-center justify-between bg-superficie px-4 py-3">
                    <span className="flex items-center gap-2">
                      <Marca clase="h-6 w-6" />
                      <span className="text-[13px] font-bold tracking-tight text-tinta">{p.demoNegocio}</span>
                    </span>
                    <span className="text-[11px] font-semibold text-tinta/40">{t.comun.hoy}</span>
                  </div>

                  <div className="space-y-2.5 p-3.5">
                    {/* el número que importa */}
                    <div className="rounded-2xl border border-borde bg-superficie p-4">
                      <p className="text-[10.5px] font-bold uppercase tracking-[.14em] text-tinta/40">{p.demoTeQuedoHoy}</p>
                      <p className="mt-1 text-[27px] font-titulo font-extrabold tracking-tight tabular-nums text-verde-fuerte">
                        Gs. 2.150.000
                      </p>
                      <p className="mt-1.5 inline-flex items-center gap-1 rounded-full bg-verde-claro px-2 py-0.5
                                    text-[11px] font-bold text-verde-fuerte">
                        ↑ 18 % <span className="font-medium text-tinta/45">{p.demoComparado}</span>
                      </p>
                      <div className="mt-3 flex gap-4 border-t border-borde pt-2.5">
                        <span className="text-[11.5px] font-semibold text-tinta/50">
                          {p.entro} <b className="ml-1 tabular-nums text-tinta">2.600.000</b>
                        </span>
                        <span className="text-[11.5px] font-semibold text-tinta/50">
                          {p.salio} <b className="ml-1 tabular-nums text-rojo">150.000</b>
                        </span>
                      </div>
                    </div>

                    {/* cómo se cargó: hablando */}
                    <div className="rounded-2xl border border-borde bg-superficie p-3.5">
                      <p className="text-[10.5px] font-bold uppercase tracking-[.14em] text-tinta/40">{p.demoLoCargasteAsi}</p>
                      <div className="mt-2 flex items-start gap-2">
                        <span className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full bg-verde-claro">
                          <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 text-verde-fuerte" fill="none"
                               stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                            <path d="M12 15a3 3 0 0 0 3-3V6a3 3 0 1 0-6 0v6a3 3 0 0 0 3 3Z" />
                            <path d="M18.5 11.5A6.5 6.5 0 0 1 5.5 11.5M12 18v3" />
                          </svg>
                        </span>
                        <p className="text-[12.5px] leading-snug text-tinta/70">
                          {p.demoDictado}
                        </p>
                      </div>
                      <p className="mt-2.5 flex items-center gap-1.5 border-t border-borde pt-2 text-[11.5px] font-semibold text-verde-fuerte">
                        <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor"
                             strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round">
                          <path d="m5 13 4 4L19 7" />
                        </svg>
                        {p.demoCargado}
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* ---------------- La franja de confianza ----------------
            Cuatro cosas que son ciertas y se pueden comprobar. No hay
            cantidad de usuarios ni testimonios: inventar un número en la
            portada de un sistema de plata es la forma más rápida de perder
            justamente lo que esta franja viene a dar. */}
        <div className="relative border-t border-white/10 bg-noche-hondo/60">
          <div className="mx-auto grid max-w-6xl grid-cols-2 gap-px px-5 lg:grid-cols-4">
            <Dato valor="1.600+" texto={p.datoPruebas} />
            <Dato valor="0" texto={p.datoAjenos} />
            <Dato valor={p.datoSinSenalValor} texto={p.datoSinSenal} />
            <Dato valor={diasNegocio} texto={p.datoPrueba} />
          </div>
        </div>
      </section>


      {/* ---------------- Los dos públicos ---------------- */}
      <section id="formas" className="border-y border-borde bg-arena scroll-mt-4">
        <div className="mx-auto max-w-6xl px-5 py-14">
          <h2 className="text-[25px] font-titulo font-extrabold tracking-tight lg:text-[33px]">
            {p.formasTitulo}
          </h2>
          <p className="mt-2 max-w-2xl text-[15px] leading-relaxed text-tinta/60">
            {p.formasBajada}
          </p>

          <div className="mt-8 grid gap-4 lg:grid-cols-2">
            <Forma
              etiqueta={p.laMasUsada}
              destacado
              titulo={p.paraTuNegocio}
              para={p.paraTuNegocioQuien}
              detalle={p.paraTuNegocioDetalle}
              prueba={p.dePrueba(diasNegocio)}
              sinTarjeta={p.sinTarjeta}
              boton={p.crearCuentaNegocio}
              para_link="/crear?para=negocio"
              puntos={p.puntosNegocio}
            />
            <Forma
              titulo={p.paraVos}
              para={p.paraVosQuien}
              detalle={p.paraVosDetalle}
              prueba={p.dePrueba(diasPersonal)}
              sinTarjeta={p.sinTarjeta}
              boton={p.crearCuentaPersonal}
              para_link="/crear?para=personal"
              puntos={p.puntosPersonal}
            />
          </div>
        </div>
      </section>

      {/* ---------------- Cómo se carga ---------------- */}
      <section className="mx-auto max-w-6xl px-5 py-14">
        <h2 className="text-[25px] font-titulo font-extrabold tracking-tight lg:text-[33px]">
          {p.cargarTitulo}
        </h2>

        <div className="mt-8 grid gap-4 md:grid-cols-3">
          <Modo
            titulo={p.modoVoz}
            detalle={p.modoVozDetalle}
            icono={<path d="M12 15a3 3 0 0 0 3-3V6a3 3 0 1 0-6 0v6a3 3 0 0 0 3 3Z M18.5 11.5A6.5 6.5 0 0 1 5.5 11.5M12 18v3.2" />}
          />
          <Modo
            titulo={p.modoFoto}
            detalle={p.modoFotoDetalle}
            icono={<path d="M3.5 8.5h3l1.5-2.5h8L17.5 8.5h3v10h-17z M12 13m-3.2 0a3.2 3.2 0 1 0 6.4 0a3.2 3.2 0 1 0-6.4 0" />}
          />
          <Modo
            titulo={p.modoTexto}
            detalle={p.modoTextoDetalle}
            icono={<path d="M4 6h16M4 12h16M4 18h10" />}
          />
        </div>

        <p className="mt-6 max-w-2xl text-[14.5px] leading-relaxed text-tinta/60">
          <Rico texto={p.deudasTambien} />
        </p>
      </section>

      {/* ---------------- Cómo se ve por dentro ----------------
          Toda la sección aparece recién cuando hay al menos un video cargado
          en src/lib/demos.ts. Un título que promete videos arriba de un hueco
          vacío deja peor parada a la página que no tener la sección. */}
      {HAY_DEMOS && (
        <section className="border-t border-borde">
          <div className="mx-auto max-w-6xl px-5 py-14">
            <h2 className="text-[25px] font-titulo font-extrabold tracking-tight lg:text-[33px]">
              {p.demosTitulo}
            </h2>
            <p className="mt-2 max-w-2xl text-[15px] leading-relaxed text-tinta/60">
              {p.demosBajada}
            </p>
            <Demos idioma={idioma} />
          </div>
        </section>
      )}

      {/* ---------------- Qué te devuelve ---------------- */}
      <section className="border-y border-borde bg-arena">
        <div className="mx-auto max-w-6xl px-5 py-14">
          <div className="grid gap-10 lg:grid-cols-2">
            <div>
              <h2 className="text-[25px] font-titulo font-extrabold tracking-tight lg:text-[33px]">
                {p.nocheTitulo}
              </h2>
              <p className="mt-4 text-[15.5px] leading-relaxed text-tinta/65">
                <Rico texto={p.nocheBajada} />
              </p>
              <ul className="mt-6 space-y-3">
                {p.nochePuntos.map((linea) => (
                  <li key={linea} className="flex items-start gap-2.5 text-[14.5px] leading-relaxed text-tinta/70">
                    <svg viewBox="0 0 24 24" className="mt-1 h-4 w-4 shrink-0 text-verde-fuerte"
                         fill="none" stroke="currentColor" strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round">
                      <path d="m5 13 4 4L19 7" />
                    </svg>
                    {linea}
                  </li>
                ))}
              </ul>
            </div>

            {/* Muestra de lo que se ve adentro. No es una captura de pantalla:
                es la pantalla real, con números de ejemplo. */}
            <div className="tarjeta self-start p-5">
              <p className="titulo-seccion">{p.cierreDelDia}</p>
              <p className="mt-1 text-[19px] font-bold tracking-tight">{p.cierreFecha}</p>
              <div className="mt-4 divide-y divide-borde">
                <Fila etiqueta={p.entro} valor="Gs. 2.600.000" tono="text-verde-fuerte" />
                <Fila etiqueta={p.salio} valor="Gs. 150.000" tono="text-rojo" />
                <Fila etiqueta={p.teQuedo} valor="Gs. 2.150.000" tono="text-verde-fuerte" grande />
              </div>
              <p className="mt-4 text-[13px] font-semibold text-verde-fuerte">
                {p.cierreMas} <span className="font-normal text-tinta/50">{p.cierreComparado}</span>
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ---------------- Precios ---------------- */}
      <section id="precios" className="mx-auto max-w-6xl px-5 py-14 scroll-mt-4">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <h2 className="text-[25px] font-titulo font-extrabold tracking-tight lg:text-[33px]">{p.cuantoCuesta}</h2>
        </div>

        <p className="mt-2 max-w-2xl text-[15px] leading-relaxed text-tinta/60">
          <Rico texto={p.preciosBajada} negrita="text-tinta" />
        </p>

        {/* Arriba de los precios y no en la letra chica: quien tiene una
            tarjeta de otro país tiene que saber antes de elegir que se le
            cobra en guaraníes. Enterarse tarde de cómo se paga es de las
            cosas que hacen abandonar. */}
        <p className="mt-3 max-w-2xl rounded-xl bg-arena px-4 py-3 text-[13.5px] leading-relaxed text-tinta/65">
          {t.plan.cobroEnGuaranies}
        </p>

        {/* ---- negocio ---- */}
        <div className="mt-10">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h3 className="text-[18px] font-bold tracking-tight">{p.paraTuNegocio}</h3>
            <span className="text-[13.5px] font-semibold text-tinta/45">{p.dePrueba(diasNegocio)}</span>
          </div>

          <div className="mt-4 grid gap-4 md:grid-cols-3">
            <Plan
              nombre="Básico"
              llamado={p.empezarLos(diasNegocio)}
              enlace="/crear?para=negocio"
              precio={importe(basicoMes)}
              referencia={enDolares(basicoMes)}
              porMes={p.porMes}
              para={p.basicoPara}
              puntos={p.basicoPuntos}
              nota={ahorroBasico > 0 && basicoAnio ? p.alAnio(importe(basicoAnio), ahorroBasico) : undefined}
            />
            <Plan
              destacado
              nombre="Pro"
              llamado={p.empezarLos(diasNegocio)}
              enlace="/crear?para=negocio"
              precio={importe(proMes)}
              referencia={enDolares(proMes)}
              porMes={p.porMes}
              para={p.proPara}
              puntos={p.proPuntos}
              nota={ahorroPro > 0 && proAnio ? p.alAnio(importe(proAnio), ahorroPro) : undefined}
            />
            <Plan
              nombre="Premium"
              llamado={p.empezarLos(diasNegocio)}
              enlace="/crear?para=negocio"
              precio={importe(premiumMes)}
              referencia={enDolares(premiumMes)}
              porMes={p.porMes}
              desde={p.desde}
              para={p.premiumPara}
              /* Acá decía «sin tope de vendedores» y la base cortaba en 15.
                 Desde la 048 el tope lo escribimos negocio por negocio al
                 cobrar, así que ahora se puede decir la verdad: los que
                 pagues. Prometer «sin tope» le reventaba en la cara al que
                 ya había pagado, que es el peor momento para una sorpresa. */
              puntos={p.premiumPuntos}
              nota={vendedorExtra ? p.vendedorExtra(vendedorExtra) : undefined}
            />
          </div>

          <p className="mt-4 rounded-xl bg-verde-claro/40 px-4 py-3 text-[14px] leading-relaxed text-tinta/70">
            <Rico texto={p.vendedoresNoPagan} negrita="text-tinta" />
          </p>

          {/* El descuento que se gana usando Orden en la prueba (078). Va en
              los precios porque es parte de la cuenta: quien está mirando
              cuánto le sale tiene que saber que puede pagar menos. */}
          <p className="mt-3 rounded-xl bg-verde-claro/40 px-4 py-3 text-[14px] leading-relaxed text-tinta/70">
            <Rico texto={p.descuentoPrueba(descuentoPct, rachaNegocio, rachaPersonal)} negrita="text-tinta" />
            {' '}
            <Rico texto={p.descuentoConstancia(constanciaPct, constanciaDias)} negrita="text-tinta" />
          </p>

          {/* Se aclara acá, en los precios, porque es donde alguien está
              haciendo la cuenta de cuánto le sale. Que la comisión esté en
              todos los planes —y también mientras prueba— cambia esa cuenta. */}
          <p className="mt-3 rounded-xl bg-arena px-4 py-3 text-[14px] leading-relaxed text-tinta/70">
            <Rico texto={p.recomendarEnPlanes} negrita="text-tinta" />{' '}
            <a href="#recomendar" className="font-semibold text-verde-fuerte hover:underline">
              {p.comoFunciona}
            </a>
          </p>
        </div>

        {/* ---- personal ---- */}
        <div className="mt-12">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h3 className="text-[18px] font-bold tracking-tight">{p.paraVos}</h3>
            <span className="text-[13.5px] font-semibold text-tinta/45">{p.dePrueba(diasPersonal)}</span>
          </div>

          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <Plan
              nombre={p.personalNombre}
              llamado={p.empezarLos(diasPersonal)}
              enlace="/crear?para=personal"
              precio={importe(personalMes)}
              referencia={enDolares(personalMes)}
              porMes={p.porMes}
              para={p.personalPara}
              puntos={p.personalPuntos}
              nota={ahorroPersonal > 0 && personalAnio ? p.alAnio(importe(personalAnio), ahorroPersonal) : undefined}
            />
            <div className="tarjeta flex flex-col justify-center p-5">
              <h4 className="text-[15px] font-bold tracking-tight">{p.porQueMenosTitulo}</h4>
              <p className="mt-2 text-[14px] leading-relaxed text-tinta/65">
                {p.porQueMenos}
              </p>
            </div>
          </div>
        </div>

        {/* ---- cómo se paga ---- */}
        <div className="mt-10 rounded-2xl border border-borde p-5">
          <h3 className="text-[15px] font-bold tracking-tight">{p.comoSePagaTitulo}</h3>
          <p className="mt-2 max-w-3xl text-[14px] leading-relaxed text-tinta/65">
            <Rico texto={p.comoSePaga} />
          </p>
        </div>

        <div className="mt-8">
          <Link href="/crear" className="boton-principal px-6 py-3 text-[15px]">
            {p.empezarPrueba}
          </Link>
        </div>
      </section>

      {/* ---------------- Ganar recomendando ----------------
          Va DESPUÉS de los precios y no antes: el que todavía no sabe cuánto
          cuesta no puede entender qué significa «la mitad del precio de su
          plan» (102: la comisión es sobre el precio de lista, no sobre lo que
          pagó con descuento).
          Y va en la portada, y no escondido adentro, porque para muchos es
          la razón por la que van a hablar de Orden con otro. */}
      <section id="recomendar" className="scroll-mt-4 border-t border-borde bg-arena">
        <div className="mx-auto max-w-6xl px-5 py-14">
          <div className="grid gap-10 lg:grid-cols-[1fr_1.1fr] lg:items-center">
            <div>
              <p className="titulo-seccion">{p.unExtra}</p>
              <h2 className="mt-2 text-[25px] font-titulo font-extrabold leading-tight tracking-tight lg:text-[33px]">
                {p.recomendarTitulo}
              </h2>
              <p className="mt-4 max-w-xl text-[15.5px] leading-relaxed text-tinta/65">
                <Rico texto={p.recomendarBajada} negrita="text-tinta" />
              </p>

              <div className="mt-6 flex flex-wrap items-center gap-3">
                <Link href="/crear" className="boton-principal px-6 py-3 text-[15px]">
                  {p.empezarPrueba}
                </Link>
                <span className="text-[13px] font-medium text-tinta/45">
                  {p.tuEnlaceAdentro}
                </span>
              </div>
            </div>

            {/* Los tres pasos. Sin adornos: es una promesa de plata y lo que
                importa es que se entienda cuándo se cobra y cuándo no. */}
            <ol className="grid gap-3 sm:grid-cols-3 lg:gap-4">
              <Paso numero="1" titulo={p.paso1Titulo} texto={p.paso1} />
              <Paso numero="2" titulo={p.paso2Titulo} texto={p.paso2} />
              <Paso numero="3" titulo={p.paso3Titulo} texto={p.paso3} />
            </ol>
          </div>

          <p className="mt-8 max-w-3xl text-[13.5px] leading-relaxed text-tinta/50">
            {p.recomendarLetraChica}
          </p>
        </div>
      </section>

      {/* ---------------- Instalar en el celular ----------------
          Estaba solo como un enlace chiquito en el pie, a otra página, y así
          no lo encontraba nadie. Va como sección propia, con la guía adentro
          y un acceso arriba al lado de «Precios».

          Es el mismo componente que se ve en /instalar y en Ajustes: se
          corrige en un solo lugar. */}
      <section id="instalar" className="scroll-mt-4 border-t border-borde">
        <div className="mx-auto max-w-6xl px-5 py-14">
          <div className="grid gap-10 lg:grid-cols-[1fr_1.1fr] lg:items-start">
            <div>
              <p className="titulo-seccion">{p.enTuCelular}</p>
              <h2 className="mt-2 text-[25px] font-titulo font-extrabold leading-tight tracking-tight lg:text-[33px]">
                {p.instalarTitulo}
              </h2>
              <p className="mt-4 max-w-xl text-[15.5px] leading-relaxed text-tinta/65">
                <Rico texto={p.instalarBajada} negrita="text-tinta" />
              </p>
              <p className="mt-4 text-[14px] leading-relaxed text-tinta/50">
                {p.pasarGuia}{' '}
                <Link href="/instalar" className="font-semibold text-verde-fuerte hover:underline">
                  {p.guiaPropia}
                </Link>
                {p.paraMandar}
              </p>
            </div>

            <div className="tarjeta p-5">
              <GuiaInstalar />
            </div>
          </div>
        </div>
      </section>

      {/* ---------------- Pie ---------------- */}
      <footer className="zona-segura-abajo border-t border-borde">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-5 py-8">
          <div className="flex items-center gap-2">
            <Marca clase="h-7 w-7" />
            <span className="text-[13.5px] font-semibold text-tinta/50">
              Orden · {new Date().getFullYear()}
            </span>
          </div>
          <nav className="flex flex-wrap gap-x-5 gap-y-2 text-[13.5px] font-semibold text-tinta/50">
            <Link href="/instalar" className="hover:text-tinta">{p.pieInstalar}</Link>
            <Link href="/privacidad" className="hover:text-tinta">{t.pantallas.privacidad}</Link>
            <Link href="/terminos" className="hover:text-tinta">{t.pantallas.terminos}</Link>
            <Link href="/ingresar" className="hover:text-tinta">{t.nav.miCuenta}</Link>
          </nav>
        </div>
      </footer>
    </main>
  );
}

/**
 * Un dato de la franja de confianza.
 *
 * Todos tienen que ser comprobables. El día que uno deje de ser cierto se
 * saca: es preferible una franja de tres que un número que no se sostiene
 * si alguien pregunta.
 */
function Dato({ valor, texto }: { valor: string; texto: string }) {
  return (
    <div className="px-1 py-7 lg:px-5">
      <p className="text-[24px] font-titulo font-extrabold tracking-tight text-menta lg:text-[28px]">{valor}</p>
      <p className="mt-1.5 text-[12.5px] leading-relaxed text-white/45">{texto}</p>
    </div>
  );
}

function Modo({ titulo, detalle, icono }: { titulo: string; detalle: string; icono: React.ReactNode }) {
  return (
    <div className="tarjeta p-5">
      <span className="grid h-10 w-10 place-items-center rounded-xl bg-verde-claro text-verde-fuerte">
        <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor"
             strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round">
          {icono}
        </svg>
      </span>
      <h3 className="mt-3.5 text-[16px] font-bold tracking-tight">{titulo}</h3>
      <p className="mt-1.5 text-[14px] leading-relaxed text-tinta/60">
        <Rico texto={detalle} />
      </p>
    </div>
  );
}

function Fila({
  etiqueta, valor, tono, grande = false,
}: { etiqueta: string; valor: string; tono: string; grande?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-3">
      <span className={`text-[14px] ${grande ? 'font-bold' : 'font-semibold text-tinta/55'}`}>{etiqueta}</span>
      <span className={`tabular-nums font-titulo font-extrabold ${grande ? 'text-[22px]' : 'text-[16px]'} ${tono}`}>{valor}</span>
    </div>
  );
}

/** Una de las dos formas de usar Orden. Es lo que se elige al crear la cuenta. */
function Forma({
  titulo, para, detalle, puntos, prueba, sinTarjeta, boton, para_link, etiqueta, destacado = false,
}: {
  titulo: string;
  para: string;
  detalle: string;
  puntos: string[];
  prueba: string;
  sinTarjeta: string;
  /** Qué dice el botón. Habla de lo que va a pasar, no «Más información». */
  boton: string;
  /** A dónde va, con el tipo de cuenta ya elegido. */
  para_link: string;
  etiqueta?: string;
  destacado?: boolean;
}) {
  return (
    <div className={`tarjeta flex flex-col p-5 ${destacado ? 'border-verde/50 ring-1 ring-verde/20' : ''}`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-[18px] font-bold tracking-tight">{titulo}</h3>
          <p className="mt-1 text-[13px] font-semibold text-tinta/50">{para}</p>
        </div>
        {etiqueta && <span className="pastilla shrink-0 bg-verde-claro text-verde-fuerte">{etiqueta}</span>}
      </div>

      <p className="mt-3 text-[14.5px] leading-relaxed text-tinta/65">{detalle}</p>

      <ul className="mt-4 flex-1 space-y-2.5">
        {puntos.map((punto) => (
          <li key={punto} className="flex items-start gap-2 text-[14px] leading-snug text-tinta/70">
            <svg viewBox="0 0 24 24" className="mt-[3px] h-3.5 w-3.5 shrink-0 text-verde-fuerte"
                 fill="none" stroke="currentColor" strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round">
              <path d="m5 13 4 4L19 7" />
            </svg>
            {punto}
          </li>
        ))}
      </ul>

      <Link
        href={para_link}
        className={`mt-5 block rounded-xl px-4 py-3 text-center text-[14.5px] font-bold transition ${
          destacado
            ? 'bg-verde text-sobre-verde hover:brightness-95'
            : 'border border-verde/40 text-verde-fuerte hover:bg-verde-claro'}`}
      >
        {boton}
      </Link>
      <p className="mt-2.5 text-center text-[12.5px] font-semibold text-verde-fuerte">
        {prueba} · {sinTarjeta}
      </p>
    </div>
  );
}

function Plan({
  nombre, precio, referencia, para, puntos, nota, llamado, enlace,
  porMes, desde, destacado = false,
}: {
  nombre: string;
  precio: string;
  /** «≈ US$ 19», chico al lado del precio. Referencia: no se cobra en dólares. */
  referencia?: string;
  para: string;
  puntos: string[];
  nota?: string;
  /** Qué dice el botón. */
  llamado: string;
  /** A dónde va, con el tipo de cuenta ya elegido. */
  enlace: string;
  /** El «/ mes» ya traducido; sin él, no se muestra. */
  porMes?: string;
  /** Para Premium: el precio es el primer escalón, no el final. Es la palabra «desde». */
  desde?: string;
  destacado?: boolean;
}) {
  return (
    <div className={`tarjeta flex flex-col p-5 ${destacado ? 'border-verde/50 ring-1 ring-verde/20' : ''}`}>
      <h3 className="text-[16px] font-bold tracking-tight">{nombre}</h3>
      <p className="mt-2 flex flex-wrap items-baseline gap-x-1.5">
        {desde && <span className="text-[13px] font-semibold text-tinta/45">{desde}</span>}
        <span className="text-[26px] font-titulo font-extrabold tracking-tight tabular-nums">{precio}</span>
        {porMes && <span className="text-[13px] font-semibold text-tinta/45">{porMes}</span>}
        {referencia && (
          <span className="text-[12.5px] font-semibold tabular-nums text-tinta/40">{referencia}</span>
        )}
      </p>
      <p className="mt-1.5 text-[13px] font-semibold text-tinta/50">{para}</p>

      <ul className="mt-4 flex-1 space-y-2">
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

      {nota && (
        <p className="mt-4 border-t border-borde pt-3 text-[13px] leading-relaxed text-tinta/55">{nota}</p>
      )}

      {/* El precio y el botón juntos: quien decidió mirando el número no
          tendría que subir de nuevo hasta arriba para encontrar por dónde
          empezar. */}
      <Link
        href={enlace}
        className={`mt-4 block rounded-xl px-4 py-2.5 text-center text-[14px] font-bold transition ${
          destacado
            ? 'bg-verde text-sobre-verde hover:brightness-95'
            : 'border border-verde/40 text-verde-fuerte hover:bg-verde-claro'}`}
      >
        {llamado}
      </Link>
    </div>
  );
}

/** Un paso del programa de recomendar. Tres, y ninguno con letra chica. */
function Paso({ numero, titulo, texto }: { numero: string; titulo: string; texto: string }) {
  return (
    <li className="tarjeta p-4">
      <span className="grid h-7 w-7 place-items-center rounded-full bg-verde text-[13px] font-black text-sobre-verde">
        {numero}
      </span>
      <p className="mt-2.5 text-[14.5px] font-bold leading-snug tracking-tight">{titulo}</p>
      <p className="mt-1 text-[13px] leading-relaxed text-tinta/55">{texto}</p>
    </li>
  );
}
