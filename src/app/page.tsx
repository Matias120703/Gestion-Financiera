import Link from 'next/link';
import { redirect } from 'next/navigation';
import type { Metadata } from 'next';
import { clienteServidor } from '@/lib/supabase/servidor';
import { dinero } from '@/lib/formato';
import { textos, idiomaActual } from '@/i18n';
import Demos from '@/components/Demos';
import { Marca } from '@/components/Marca';
import { HAY_DEMOS } from '@/lib/demos';
import { FICHA, MONEDA_DE_COBRO } from '@/i18n/idiomas';
import type { Precio } from '@/lib/tipos';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Orden · Sabé cuánto ganás de verdad',
  description:
    'Registrá ventas, gastos y deudas hablando, sacando una foto o escribiendo. '
    + 'Orden calcula tu ganancia real todos los días. Para tu negocio o para tus finanzas personales.',
  openGraph: {
    title: 'Orden · Sabé cuánto ganás de verdad',
    description: 'Registrá ventas, gastos y deudas en segundos. Mirá tu ganancia real todos los días.',
    type: 'website',
  },
};

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
 */
export default async function Portada() {
  // Con sesión, esta página no aporta nada: al panel.
  const supabase = clienteServidor();
  const { data: { user } } = await supabase.auth.getUser();
  if (user) redirect('/panel');

  const t = textos();
  const idioma = idiomaActual();
  const locale = FICHA[idioma].locale;
  const moneda = MONEDA_DE_COBRO[idioma] ?? 'USD';

  // Si la lectura de precios falla, la portada igual se muestra: mejor una
  // página sin la tabla de precios que un error para alguien que todavía no
  // sabe qué es esto.
  const { data } = await supabase.rpc('lista_precios', { p_moneda: moneda });
  const precios = (Array.isArray(data) ? data : []) as Precio[];

  const precioDe = (tipo: string, plan: string, periodo = 'mensual') =>
    precios.find((p) => p.tipo_cuenta === tipo && p.plan === plan && p.periodo === periodo) ?? null;

  const importe = (p: Precio | null) =>
    p ? dinero(Number(p.importe), moneda, true, locale) : '—';

  const personalMes = precioDe('personal', 'pro');
  const personalAnio = precioDe('personal', 'pro', 'anual');
  const proMes = precioDe('emprendedor', 'pro');
  const proAnio = precioDe('emprendedor', 'pro', 'anual');
  const premiumMes = precioDe('emprendedor', 'negocio');

  const { data: porVendedor } = await supabase.rpc('precio_por_vendedor', { p_moneda: moneda });
  const vendedorExtra = porVendedor != null
    ? dinero(Number(porVendedor), moneda, true, locale)
    : null;

  /** «Dos meses gratis» solo se dice si los números lo sostienen. */
  const mesesGratis = (mes: Precio | null, anio: Precio | null) => {
    if (!mes || !anio || Number(mes.importe) <= 0) return 0;
    return Math.max(0, Math.round(12 - Number(anio.importe) / Number(mes.importe)));
  };
  const ahorroPersonal = mesesGratis(personalMes, personalAnio);
  const ahorroPro = mesesGratis(proMes, proAnio);

  return (
    <main className="min-h-screen bg-white">

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
            style={{ background: 'radial-gradient(circle, rgba(23,121,90,.55) 0%, rgba(23,121,90,0) 70%)' }}
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
              <span className="text-[17px] font-bold tracking-tight">Orden</span>
            </div>
            <div className="flex items-center gap-5">
              <a href="#precios" className="hidden text-[13.5px] font-semibold text-white/60 transition hover:text-white sm:block">
                Precios
              </a>
              <Link
                href="/ingresar"
                className="rounded-xl border border-white/15 bg-white/5 px-4 py-2 text-[13.5px] font-semibold
                           text-white backdrop-blur transition hover:border-white/30 hover:bg-white/10"
              >
                Entrar
              </Link>
            </div>
          </div>
        </header>

        {/* ---------------- El titular y el producto ---------------- */}
        <div className="relative mx-auto max-w-6xl px-5 pb-16 pt-10 lg:pb-24 lg:pt-16">
          <div className="grid items-center gap-14 lg:grid-cols-[1.05fr_1fr]">
            <div>
              <span className="inline-flex items-center gap-2 rounded-full border border-menta/25 bg-menta/10
                               px-3 py-1.5 text-[11.5px] font-bold uppercase tracking-[.13em] text-menta">
                <span className="h-1.5 w-1.5 rounded-full bg-menta" />
                Hecho en Paraguay
              </span>

              <h1 className="mt-5 text-[38px] font-bold leading-[1.05] tracking-tight sm:text-[46px] lg:text-[58px]">
                ¿Sabés cuánto<br />
                ganaste{' '}
                <span className="bg-gradient-to-r from-menta to-menta-suave bg-clip-text text-transparent">
                  de verdad
                </span>
                ?
              </h1>

              <p className="mt-6 max-w-xl text-[17px] leading-relaxed text-white/65 lg:text-[19px]">
                No cuánto vendiste: cuánto <strong className="font-semibold text-white">te quedó</strong> después
                de lo que pagaste por la mercadería y de todos los gastos. Orden lo calcula solo,
                todos los días, y para cargarlo alcanza con contárselo.
              </p>

              <div className="mt-9 flex flex-wrap items-center gap-3">
                <Link
                  href="/crear"
                  className="rounded-xl bg-menta px-6 py-3.5 text-[15px] font-bold text-noche shadow-lg
                             shadow-menta/20 transition hover:bg-menta-suave"
                >
                  Probar 20 días gratis
                </Link>
                <a
                  href="#formas"
                  className="rounded-xl border border-white/15 px-6 py-3.5 text-[15px] font-semibold
                             text-white/85 transition hover:border-white/35 hover:text-white"
                >
                  Ver cómo funciona
                </a>
              </div>

              <p className="mt-5 text-[13.5px] font-medium text-white/45">
                Sin tarjeta · Cancelás cuando quieras · Tus datos siguen siendo tuyos si te vas
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
                  <div className="flex items-center justify-between bg-white px-4 py-3">
                    <span className="flex items-center gap-2">
                      <Marca clase="h-6 w-6" />
                      <span className="text-[13px] font-bold tracking-tight text-tinta">Perfumería Aurora</span>
                    </span>
                    <span className="text-[11px] font-semibold text-tinta/40">Hoy</span>
                  </div>

                  <div className="space-y-2.5 p-3.5">
                    {/* el número que importa */}
                    <div className="rounded-2xl border border-borde bg-white p-4">
                      <p className="text-[10.5px] font-bold uppercase tracking-[.14em] text-tinta/40">Te quedó hoy</p>
                      <p className="mt-1 text-[27px] font-bold tracking-tight tabular-nums text-verde-fuerte">
                        Gs. 2.150.000
                      </p>
                      <p className="mt-1.5 inline-flex items-center gap-1 rounded-full bg-verde-claro px-2 py-0.5
                                    text-[11px] font-bold text-verde-fuerte">
                        ↑ 18 % <span className="font-medium text-tinta/45">que el martes pasado</span>
                      </p>
                      <div className="mt-3 flex gap-4 border-t border-borde pt-2.5">
                        <span className="text-[11.5px] font-semibold text-tinta/50">
                          Entró <b className="ml-1 tabular-nums text-tinta">2.600.000</b>
                        </span>
                        <span className="text-[11.5px] font-semibold text-tinta/50">
                          Salió <b className="ml-1 tabular-nums text-rojo">150.000</b>
                        </span>
                      </div>
                    </div>

                    {/* cómo se cargó: hablando */}
                    <div className="rounded-2xl border border-borde bg-white p-3.5">
                      <p className="text-[10.5px] font-bold uppercase tracking-[.14em] text-tinta/40">Lo cargaste así</p>
                      <div className="mt-2 flex items-start gap-2">
                        <span className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full bg-verde-claro">
                          <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 text-verde-fuerte" fill="none"
                               stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                            <path d="M12 15a3 3 0 0 0 3-3V6a3 3 0 1 0-6 0v6a3 3 0 0 0 3 3Z" />
                            <path d="M18.5 11.5A6.5 6.5 0 0 1 5.5 11.5M12 18v3" />
                          </svg>
                        </span>
                        <p className="text-[12.5px] leading-snug text-tinta/70">
                          «Vendí dos perfumes a ciento cincuenta mil cada uno»
                        </p>
                      </div>
                      <p className="mt-2.5 flex items-center gap-1.5 border-t border-borde pt-2 text-[11.5px] font-semibold text-verde-fuerte">
                        <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor"
                             strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round">
                          <path d="m5 13 4 4L19 7" />
                        </svg>
                        Cargado · stock descontado
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
            <Dato valor="1.600+" texto="comprobaciones automáticas corren antes de cada cambio" />
            <Dato valor="0" texto="datos tuyos que ve otro negocio: lo impide la base, no la pantalla" />
            <Dato valor="Sin señal" texto="se instala como app y abre igual cuando se corta internet" />
            <Dato valor="20 días" texto="de prueba, sin cargar una tarjeta en ningún lado" />
          </div>
        </div>
      </section>


      {/* ---------------- Los dos públicos ---------------- */}
      <section id="formas" className="border-y border-borde bg-arena scroll-mt-4">
        <div className="mx-auto max-w-6xl px-5 py-14">
          <h2 className="text-[25px] font-bold tracking-tight lg:text-[33px]">
            Dos formas de usar Orden. Elegís al crear la cuenta.
          </h2>
          <p className="mt-2 max-w-2xl text-[15px] leading-relaxed text-tinta/60">
            Es el mismo sistema, pero no te mostramos pantallas que no vas a usar. Si tenés un
            negocio vas a ver ventas y productos; si es para vos, no aparecen en ningún lado.
          </p>

          <div className="mt-8 grid gap-4 lg:grid-cols-2">
            <Forma
              etiqueta="La más usada"
              destacado
              titulo="Para tu negocio"
              para="Almacén, perfumería, delivery, taller, tienda de ropa"
              detalle="Todo lo que necesitás para saber si el mes cerró bien, y para que tus vendedores carguen sin ver lo que no tienen que ver."
              prueba="20 días de prueba"
              boton="Crear la cuenta de mi negocio"
              para_link="/crear?para=negocio"
              puntos={[
                'Ventas con productos, precios y stock que se descuenta solo',
                'La ganancia real: se calcula con el costo que tenía el producto el día que lo vendiste',
                'Vendedores con su propia cuenta — y vos ves quién cargó cada venta',
                'Tus costos y tus deudas no los ve un vendedor. Lo impide la base de datos, no la pantalla',
                'Gastos, otros ingresos y deudas del negocio',
                'Excel de cinco hojas y cierre del día',
              ]}
            />
            <Forma
              titulo="Para vos"
              para="Sueldo, gastos del día a día, tarjetas y préstamos"
              detalle="Lo mismo, sin la parte de comercio. Pensado para saber cuánto te queda y, sobre todo, cuánto debés."
              prueba="14 días de prueba"
              boton="Crear mi cuenta personal"
              para_link="/crear?para=personal"
              puntos={[
                'Tu sueldo y cualquier ingreso extra',
                'Los gastos del día a día, cargados hablando',
                'Tus deudas: tarjeta, préstamo, lo que le debés a alguien',
                'Cuándo vence cada cuota y cuánto falta para saldarla',
                'Sin ventas ni productos: esas pantallas no existen para vos',
                'El mismo Excel y el mismo cierre del día',
              ]}
            />
          </div>
        </div>
      </section>

      {/* ---------------- Cómo se carga ---------------- */}
      <section className="mx-auto max-w-6xl px-5 py-14">
        <h2 className="text-[25px] font-bold tracking-tight lg:text-[33px]">
          Cargar una venta te tiene que llevar menos que cobrarla.
        </h2>

        <div className="mt-8 grid gap-4 md:grid-cols-3">
          <Modo
            titulo="Contáselo hablando"
            detalle="«Vendí dos perfumes a 150 mil cada uno». Lo entiende, lo ordena y te lo muestra para que confirmes."
            icono={<path d="M12 15a3 3 0 0 0 3-3V6a3 3 0 1 0-6 0v6a3 3 0 0 0 3 3Z M18.5 11.5A6.5 6.5 0 0 1 5.5 11.5M12 18v3.2" />}
          />
          <Modo
            titulo="Sacale una foto"
            detalle="Al ticket o a la factura. Lee el monto y guarda la foto pegada al movimiento, para cuando la necesites."
            icono={<path d="M3.5 8.5h3l1.5-2.5h8L17.5 8.5h3v10h-17z M12 13m-3.2 0a3.2 3.2 0 1 0 6.4 0a3.2 3.2 0 1 0-6.4 0" />}
          />
          <Modo
            titulo="O escribilo"
            detalle="Como se lo contarías a alguien. Sin formularios de veinte campos ni categorías que adivinar."
            icono={<path d="M4 6h16M4 12h16M4 18h10" />}
          />
        </div>

        <p className="mt-6 max-w-2xl text-[14.5px] leading-relaxed text-tinta/60">
          Las deudas también. Decí <em>«debo cinco millones de la tarjeta»</em> y queda cargada
          como deuda — no como plata que entró.
        </p>
      </section>

      {/* ---------------- Cómo se ve por dentro ----------------
          Toda la sección aparece recién cuando hay al menos un video cargado
          en src/lib/demos.ts. Un título que promete videos arriba de un hueco
          vacío deja peor parada a la página que no tener la sección. */}
      {HAY_DEMOS && (
        <section className="border-t border-borde">
          <div className="mx-auto max-w-6xl px-5 py-14">
            <h2 className="text-[25px] font-bold tracking-tight lg:text-[33px]">
              Así se ve por dentro.
            </h2>
            <p className="mt-2 max-w-2xl text-[15px] leading-relaxed text-tinta/60">
              Grabado de la app de verdad, sin retoques. Los videos no tienen audio
              y no se descargan hasta que los apretás.
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
              <h2 className="text-[25px] font-bold tracking-tight lg:text-[33px]">
                Y a la noche, en diez segundos, sabés cómo te fue.
              </h2>
              <p className="mt-4 text-[15.5px] leading-relaxed text-tinta/65">
                El cierre del día te muestra cuánto entró, cuánto salió y cuánto te quedó.
                Comparado con el mismo día de la semana pasada, para que sepas si fue un
                buen día <em>para vos</em> y no contra un promedio que no significa nada.
              </p>
              <ul className="mt-6 space-y-3">
                {[
                  'La ganancia se calcula con el costo que tenía el producto el día que lo vendiste, no con el de hoy.',
                  'Un vendedor puede cargar ventas sin ver nunca tus costos ni tus márgenes.',
                  'Excel de cinco hojas, listo para imprimir o mandar.',
                  'Se instala como app en el celular y abre aunque te quedes sin señal.',
                ].map((linea) => (
                  <li key={linea} className="flex items-start gap-2.5 text-[14.5px] leading-relaxed text-tinta/70">
                    <svg viewBox="0 0 24 24" className="mt-1 h-4 w-4 shrink-0 text-verde"
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
              <p className="titulo-seccion">Cierre del día</p>
              <p className="mt-1 text-[19px] font-bold tracking-tight">martes 12 de agosto</p>
              <div className="mt-4 divide-y divide-borde">
                <Fila etiqueta="Entró" valor="Gs. 2.600.000" tono="text-verde-fuerte" />
                <Fila etiqueta="Salió" valor="Gs. 150.000" tono="text-rojo" />
                <Fila etiqueta="Te quedó" valor="Gs. 2.150.000" tono="text-verde-fuerte" grande />
              </div>
              <p className="mt-4 text-[13px] font-semibold text-verde-fuerte">
                18 % más <span className="font-normal text-tinta/50">que el mismo día de la semana pasada</span>
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ---------------- Precios ---------------- */}
      <section id="precios" className="mx-auto max-w-6xl px-5 py-14 scroll-mt-4">
        <h2 className="text-[25px] font-bold tracking-tight lg:text-[33px]">Cuánto cuesta</h2>
        <p className="mt-2 max-w-2xl text-[15px] leading-relaxed text-tinta/60">
          Probás primero y decidís después: no se pide tarjeta para empezar. Y si algún día
          no querés seguir, <strong className="text-tinta">no te quedás sin tus datos</strong>:
          seguís entrando, viendo todo tu historial y bajando tu Excel cuando quieras.
        </p>

        {/* ---- negocio ---- */}
        <div className="mt-10">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h3 className="text-[18px] font-bold tracking-tight">Para tu negocio</h3>
            <span className="text-[13.5px] font-semibold text-tinta/45">20 días de prueba</span>
          </div>

          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <Plan
              destacado
              nombre="Pro"
              llamado="Empezar los 20 días"
              enlace="/crear?para=negocio"
              precio={importe(proMes)}
              porMes
              para="Para el negocio con hasta 2 vendedores"
              puntos={[
                'Voz, foto y texto: 600 cargas por mes',
                'Vos y hasta 2 vendedores, cada uno con su cuenta',
                'Comprobantes guardados y Excel de cinco hojas',
                'Deudas del negocio con sus vencimientos',
              ]}
              nota={ahorroPro > 0 && proAnio
                ? `O ${importe(proAnio)} al año: ${ahorroPro} ${ahorroPro === 1 ? 'mes' : 'meses'} de regalo.`
                : undefined}
            />
            <Plan
              nombre="Premium"
              llamado="Empezar los 20 días"
              enlace="/crear?para=negocio"
              precio={importe(premiumMes)}
              porMes
              desde
              para="Para el local con más gente cargando"
              puntos={[
                'Todo lo de Pro, sin tope de vendedores',
                'Voz, foto y texto: 3.000 cargas por mes',
                'Roles: quién ve los costos lo decidís vos',
                'El precio se cotiza según cuántos vendedores seas',
              ]}
              nota={vendedorExtra
                ? `Cada vendedor arriba de los 3 de Pro suma ${vendedorExtra} al mes. Escribinos y te pasamos el número exacto.`
                : undefined}
            />
          </div>

          <p className="mt-4 rounded-xl bg-verde-claro/40 px-4 py-3 text-[14px] leading-relaxed text-tinta/70">
            <strong className="text-tinta">Tus vendedores no pagan nada.</strong> La suscripción
            la paga una sola persona: el dueño del negocio. Ellos entran con su cuenta, cargan lo
            suyo y listo.
          </p>
        </div>

        {/* ---- personal ---- */}
        <div className="mt-12">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h3 className="text-[18px] font-bold tracking-tight">Para vos</h3>
            <span className="text-[13.5px] font-semibold text-tinta/45">14 días de prueba</span>
          </div>

          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <Plan
              nombre="Personal"
              llamado="Empezar los 14 días"
              enlace="/crear?para=personal"
              precio={importe(personalMes)}
              porMes
              para="Un solo plan, sin versiones ni letra chica"
              puntos={[
                'Sueldo, ingresos extra y gastos del día a día',
                'Tarjetas, préstamos y lo que le debés a alguien',
                'Voz, foto y texto: 600 cargas por mes',
                'Avisos de cuándo vence cada cuota',
              ]}
              nota={ahorroPersonal > 0 && personalAnio
                ? `O ${importe(personalAnio)} al año: ${ahorroPersonal} ${ahorroPersonal === 1 ? 'mes' : 'meses'} de regalo.`
                : undefined}
            />
            <div className="tarjeta flex flex-col justify-center p-5">
              <h4 className="text-[15px] font-bold tracking-tight">¿Por qué cuesta menos?</h4>
              <p className="mt-2 text-[14px] leading-relaxed text-tinta/65">
                Porque no recibís lo mismo. A un comercio, Orden le dice cuánta plata ganó de
                verdad, y eso se paga solo. A vos te dice cuánto debés y cuándo vence la cuota:
                te sirve, pero no te genera un guaraní. Cobrarte igual sería no haber entendido
                a ninguno de los dos.
              </p>
            </div>
          </div>
        </div>

        {/* ---- cómo se paga ---- */}
        <div className="mt-10 rounded-2xl border border-borde p-5">
          <h3 className="text-[15px] font-bold tracking-tight">Cómo se paga</h3>
          <p className="mt-2 max-w-3xl text-[14px] leading-relaxed text-tinta/65">
            Por transferencia. Cuando se te termina la prueba, tocás <em>Suscribirme</em> y se
            abre un WhatsApp con nosotros para arreglarlo. Nada de cargar una tarjeta en un
            formulario: hablás con una persona, transferís y te activamos la cuenta. Si tenés
            varios vendedores, ahí mismo te pasamos el precio exacto.
          </p>
        </div>

        <div className="mt-8">
          <Link href="/crear" className="boton-principal px-6 py-3 text-[15px]">
            Empezar la prueba gratis
          </Link>
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
            <Link href="/privacidad" className="hover:text-tinta">Privacidad</Link>
            <Link href="/terminos" className="hover:text-tinta">Términos</Link>
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
      <p className="text-[24px] font-bold tracking-tight text-menta lg:text-[28px]">{valor}</p>
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
      <p className="mt-1.5 text-[14px] leading-relaxed text-tinta/60">{detalle}</p>
    </div>
  );
}

function Fila({
  etiqueta, valor, tono, grande = false,
}: { etiqueta: string; valor: string; tono: string; grande?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-3">
      <span className={`text-[14px] ${grande ? 'font-bold' : 'font-semibold text-tinta/55'}`}>{etiqueta}</span>
      <span className={`tabular-nums font-bold ${grande ? 'text-[22px]' : 'text-[16px]'} ${tono}`}>{valor}</span>
    </div>
  );
}

/** Una de las dos formas de usar Orden. Es lo que se elige al crear la cuenta. */
function Forma({
  titulo, para, detalle, puntos, prueba, boton, para_link, etiqueta, destacado = false,
}: {
  titulo: string;
  para: string;
  detalle: string;
  puntos: string[];
  prueba: string;
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
        {puntos.map((p) => (
          <li key={p} className="flex items-start gap-2 text-[14px] leading-snug text-tinta/70">
            <svg viewBox="0 0 24 24" className="mt-[3px] h-3.5 w-3.5 shrink-0 text-verde"
                 fill="none" stroke="currentColor" strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round">
              <path d="m5 13 4 4L19 7" />
            </svg>
            {p}
          </li>
        ))}
      </ul>

      <Link
        href={para_link}
        className={`mt-5 block rounded-xl px-4 py-3 text-center text-[14.5px] font-bold transition ${
          destacado
            ? 'bg-verde text-white hover:bg-verde-fuerte'
            : 'border border-verde/40 text-verde-fuerte hover:bg-verde-claro'}`}
      >
        {boton}
      </Link>
      <p className="mt-2.5 text-center text-[12.5px] font-semibold text-verde-fuerte">
        {prueba} · sin tarjeta
      </p>
    </div>
  );
}

function Plan({
  nombre, precio, para, puntos, nota, llamado, enlace,
  porMes = false, desde = false, destacado = false,
}: {
  nombre: string;
  precio: string;
  para: string;
  puntos: string[];
  nota?: string;
  /** Qué dice el botón. */
  llamado: string;
  /** A dónde va, con el tipo de cuenta ya elegido. */
  enlace: string;
  porMes?: boolean;
  /** Para Premium: el precio es el primer escalón, no el final. */
  desde?: boolean;
  destacado?: boolean;
}) {
  return (
    <div className={`tarjeta flex flex-col p-5 ${destacado ? 'border-verde/50 ring-1 ring-verde/20' : ''}`}>
      <h3 className="text-[16px] font-bold tracking-tight">{nombre}</h3>
      <p className="mt-2 flex flex-wrap items-baseline gap-x-1.5">
        {desde && <span className="text-[13px] font-semibold text-tinta/45">desde</span>}
        <span className="text-[26px] font-bold tracking-tight tabular-nums">{precio}</span>
        {porMes && <span className="text-[13px] font-semibold text-tinta/45">/ mes</span>}
      </p>
      <p className="mt-1.5 text-[13px] font-semibold text-tinta/50">{para}</p>

      <ul className="mt-4 flex-1 space-y-2">
        {puntos.map((p) => (
          <li key={p} className="flex items-start gap-2 text-[13.5px] leading-snug text-tinta/70">
            <svg viewBox="0 0 24 24" className="mt-[3px] h-3.5 w-3.5 shrink-0 text-verde"
                 fill="none" stroke="currentColor" strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round">
              <path d="m5 13 4 4L19 7" />
            </svg>
            {p}
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
            ? 'bg-verde text-white hover:bg-verde-fuerte'
            : 'border border-verde/40 text-verde-fuerte hover:bg-verde-claro'}`}
      >
        {llamado}
      </Link>
    </div>
  );
}
