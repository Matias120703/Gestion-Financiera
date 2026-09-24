import Link from 'next/link';
import { redirect } from 'next/navigation';
import type { Metadata } from 'next';
import { clienteServidor } from '@/lib/supabase/servidor';
import { textos, idiomaActual } from '@/i18n';
import { Marca } from '@/components/Marca';
import { BotonTema } from '@/components/BotonTema';
import { GuiaInstalar } from '@/components/GuiaInstalar';
import { Rico } from '@/components/Rico';
import { ElegiTuRubro } from '@/components/portada/ElegiTuRubro';
import { SelectorIdiomaPortada } from '@/components/portada/SelectorIdiomaPortada';
import {
  claveInicial, planesPorRubroDe, type PrecioVitrina,
} from '@/components/portada/vitrina-datos';
import { fichaDe } from '@/lib/rubros';
import type { Precio } from '@/lib/tipos';
import { DIAS_DE_PRUEBA, MONEDA_DE_REFERENCIA, monedaDeCobro } from '@/lib/precios';

export const dynamic = 'force-dynamic';

/** El título y la descripción, en el idioma de quien abre la portada. */
export async function generateMetadata(): Promise<Metadata> {
  const t = await textos();
  // El `openGraph` de una página reemplaza ENTERO al del layout (Next no los
  // mezcla): sin repetir `siteName` y `locale`, en `/` se perdían. Los
  // mismos valores que usa `COMPARTIR` en layout.tsx.
  const pt = (await idiomaActual()) === 'pt';
  return {
    title: t.portada.metaTitulo,
    description: t.portada.metaDescripcion,
    openGraph: {
      title: t.portada.metaTitulo,
      description: t.portada.metaDescripcionCorta,
      type: 'website',
      siteName: 'Orden',
      locale: pt ? 'pt_BR' : 'es_PY',
      alternateLocale: [pt ? 'es_PY' : 'pt_BR'],
    },
  };
}

/**
 * Cuántas comprobaciones automáticas hay, para la franja de confianza.
 *
 * Se contó el 24/09 corriendo `npm run probar`: 4.953 comprobaciones
 * pasaron y ninguna falló (las líneas `✓` y `ok` de la salida; hay más que
 * llamadas a `ok(` en el código porque varias corren dentro de un bucle). Se
 * redondea PARA ABAJO: el número tiene que quedarse corto, nunca largo. No
 * se lee en vivo porque las pruebas no viajan con la aplicación.
 *
 * Y no dice «antes de cada cambio», como decía: no hay nada que las corra
 * solas (no hay integración continua). Corren cuando alguien las corre.
 */
const DATO_COMPROBACIONES = '4.900+';

/**
 * LA PORTADA (rehecha el 24/09)
 *
 * Antes, `/` redirigía derecho al panel. Para quien ya tiene cuenta estaba
 * bien; para todos los demás significaba caer en un formulario de login de un
 * producto del que nunca escucharon. Si le mandás el link a alguien, esto es
 * lo único que va a leer antes de decidir.
 *
 * LO QUE CAMBIÓ EL 24/09: Orden dejó de ser «el sistema del comercio». Hoy
 * se arma distinto para un comercio, una barbería, un profe, un personal
 * trainer, un productor de soja, un ganadero y una persona con sueldo, y la
 * portada seguía hablando solo de perfumes. Ahora el centro es la vitrina
 * (`ElegiTuRubro`): tocás tu rubro y el celular, los beneficios y los planes
 * con sus precios cambian a los tuyos. Es la única parte de cliente; el
 * resto se arma acá, en el servidor, y sale rápido.
 *
 * Las reglas de siempre:
 *
 *   · HABLA DEL PROBLEMA, NO DE LA TECNOLOGÍA. A nadie le importa que use
 *     IA. Le importa no saber cuánto le quedó este mes.
 *   · LOS PRECIOS SALEN DE LA BASE (`lista_precios`, `promo_de_la_prueba`,
 *     `precio_por_vendedor`) y los planes de cada rubro de su ficha
 *     (`fichaDe(rubro).planes`, espejo de `planes_de_rubro()`). Un precio
 *     escrito a mano acá sería el primero en quedar viejo y mentirle a
 *     alguien.
 *   · NADA QUE NO SEA VERDAD. Cada frase se sostiene con lo que Orden hace
 *     hoy. Si algo deja de ser cierto, se saca.
 *   · QUIEN YA ENTRÓ NO LA VE. Se lo manda derecho al panel.
 *
 * Los textos viven en el diccionario (`portada`, y `vitrina.ts` para la
 * vitrina), en español y en portugués. Acá solo queda la estructura.
 */
export default async function Portada() {
  // Con sesión, esta página no aporta nada: al panel.
  const supabase = clienteServidor();
  const { data: { user } } = await supabase.auth.getUser();
  if (user) redirect('/panel');

  const t = await textos();
  const p = t.portada;
  const idioma = await idiomaActual();

  const diasNegocio = p.dias(DIAS_DE_PRUEBA.emprendedor);

  /**
   * Lo que la vitrina necesita de la base, en una sola vuelta: las tres
   * lecturas salen juntas en vez de una detrás de la otra.
   *
   * Si alguna falla, la portada igual se muestra: mejor una tarjeta sin
   * precio que un error para alguien que todavía no sabe qué es esto. Los
   * precios se piden en todas las monedas (`p_moneda` en null): los
   * guaraníes, que es lo que se cobra (23/09), y los dólares, que van al
   * lado como referencia chica y no se cobran.
   */
  const moneda = monedaDeCobro();
  const [{ data: lista }, { data: promo }, { data: porVendedor }] = await Promise.all([
    supabase.rpc('lista_precios', { p_moneda: null }),
    supabase.rpc('promo_de_la_prueba'),
    supabase.rpc('precio_por_vendedor', { p_moneda: moneda }),
  ]);

  const todos = (Array.isArray(lista) ? lista : []) as Precio[];
  const aVitrina = (enMoneda: string): PrecioVitrina[] =>
    todos
      .filter((x) => x.moneda === enMoneda && (x.tipo_cuenta === 'emprendedor' || x.tipo_cuenta === 'personal'))
      .map((x) => ({ plan: x.plan, periodo: x.periodo, importe: Number(x.importe), tipo: x.tipo_cuenta }))
      .filter((x) => Number.isFinite(x.importe));

  /**
   * Los números de las promos (078, 093) salen de `ajustes_orden`, que es
   * donde se editan sin desplegar. Si la lectura falla quedan los de por
   * defecto: decir un número equivocado sería peor que no decirlo.
   */
  const leida = (promo ?? null) as {
    porcentaje?: number; negocio?: number; personal?: number;
    constancia_porcentaje?: number; constancia_dias?: number;
  } | null;
  const promoVitrina = {
    porcentaje: Math.round(Number(leida?.porcentaje ?? 18)),
    negocio: Number(leida?.negocio ?? DIAS_DE_PRUEBA.emprendedor),
    personal: Number(leida?.personal ?? DIAS_DE_PRUEBA.personal),
    constanciaPorcentaje: Math.round(Number(leida?.constancia_porcentaje ?? 5)),
    constanciaDias: Number(leida?.constancia_dias ?? 30),
  };

  const vendedorExtra = porVendedor != null && Number.isFinite(Number(porVendedor))
    ? Number(porVendedor)
    : null;

  const preguntas = p.preguntas({ negocio: DIAS_DE_PRUEBA.emprendedor, personal: DIAS_DE_PRUEBA.personal });

  /**
   * Las preguntas frecuentes, también para los buscadores (schema.org
   * FAQPage). Es el mismo texto que se lee en la página, sin las marcas de
   * negrita y cursiva. El `<` se escapa para que ningún texto pueda cerrar
   * la etiqueta del guion.
   */
  const faqJson = JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    inLanguage: idioma,
    mainEntity: preguntas.map((q) => ({
      '@type': 'Question',
      name: q.pregunta,
      acceptedAnswer: { '@type': 'Answer', text: sinMarcas(q.respuesta) },
    })),
  }).replace(/</g, '\\u003c');

  return (
    <main className="min-h-screen bg-superficie">
      {/* Las frases que rotan en «Cómo se carga». CSS puro: sin JavaScript
          y sin librerías. Cinco frases de 3,5 s (17,5 s la vuelta); cada una
          ocupa su 20 % del ciclo. Con «reducir movimiento» no rota nada: se
          ven las cinco, una debajo de la otra. */}
      <style dangerouslySetInnerHTML={{ __html: CSS_FRASES }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: faqJson }} />

      {/* ================================================================
          LA PRIMERA PANTALLA
          ================================================================

          Va en oscuro y el resto en claro, a propósito: el oscuro da el
          golpe de entrada, y de ahí para abajo vuelve el claro, que es como
          se ve Orden por dentro. El fondo NO es negro: es el `noche` de la
          marca, para que las dos mitades se sientan del mismo producto.

          Es más corta que antes: el celular ya no está acá sino en la
          vitrina, que sube como una hoja sobre el final de esta franja.
          Lo que importa es que el que entra vea los chips de los rubros
          sin tener que buscarlos. */}
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

        {/* ---------------- Barra ----------------
            A 375 px entra todo: el ícono, «Instalar», ES · PT, el tema y
            «Entrar». La palabra «Orden» aparece desde 640 px y «Precios»
            también (en el celular la vitrina, con sus precios, está apenas
            abajo). Debajo de 370 px se esconde «Instalar», que sigue en las
            preguntas y en el pie. */}
        <header className="zona-segura-arriba relative">
          <div className="mx-auto flex max-w-6xl items-center justify-between gap-2 px-4 py-4 sm:px-5">
            <Link href="/" className="flex items-center gap-2.5" aria-label="Orden">
              <Marca clase="h-9 w-9" sobreOscuro />
              <span className="hidden text-[17px] font-bold tracking-tight sm:inline">Orden</span>
            </Link>
            <nav className="flex items-center gap-2 sm:gap-4">
              <a href="#precios" className="hidden text-[13.5px] font-semibold text-white/60 transition hover:text-white sm:block">
                {p.precios}
              </a>
              <a
                href="#instalar"
                className="hidden py-3 text-[13.5px] font-semibold text-white/60 transition hover:text-white min-[370px]:block"
              >
                {p.instalar}
              </a>
              <SelectorIdiomaPortada etiqueta={p.idioma} />
              <BotonTema />
              <Link
                href="/ingresar"
                className="rounded-xl border border-white/15 bg-white/5 px-3 py-2 text-[13.5px] font-semibold
                           text-white backdrop-blur transition hover:border-white/30 hover:bg-white/10 sm:px-4"
              >
                {p.entrar}
              </Link>
            </nav>
          </div>
        </header>

        {/* ---------------- El titular ----------------
            Los verbos de los oficios arriba, chicos, y la pregunta de siempre
            abajo, grande: Orden cambia según lo que hacés, lo que te
            responde no. */}
        <div className="relative mx-auto max-w-4xl px-4 pb-24 pt-8 text-center sm:px-5 lg:pb-32 lg:pt-14">
          <h1 className="font-titulo font-extrabold tracking-tight">
            <span className="block text-[19px] leading-snug text-white/60 sm:text-[24px] lg:text-[30px]">
              {p.titularOficios}
            </span>
            <span className="mt-2 block text-[40px] leading-[1.02] sm:text-[56px] lg:text-[76px]">
              {p.titular}{' '}
              <span className="bg-gradient-to-r from-menta to-menta-suave bg-clip-text text-transparent">
                {p.titularResaltado}
              </span>
              {p.titularCierre}
            </span>
          </h1>

          <p className="mx-auto mt-6 max-w-2xl text-[16.5px] leading-relaxed text-white/65 lg:text-[19px]">
            <Rico texto={p.bajada} negrita="font-semibold text-white" />
          </p>

          <div className="mt-9 flex flex-col items-stretch justify-center gap-3 min-[420px]:flex-row min-[420px]:items-center">
            <Link
              href="/crear"
              className="rounded-xl bg-menta px-6 py-3.5 text-[15px] font-bold text-noche shadow-lg
                         shadow-menta/20 transition hover:bg-menta-suave"
            >
              {p.probarGratis(diasNegocio)}
            </Link>
            <a
              href="#rubros"
              className="inline-flex items-center justify-center gap-2 rounded-xl border border-white/15 px-6 py-3.5
                         text-[15px] font-semibold text-white/85 transition hover:border-white/35 hover:text-white"
            >
              {p.verLoTuyo}
              <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor"
                   strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M12 5v14M6 13l6 6 6-6" />
              </svg>
            </a>
          </div>

          <p className="mt-5 text-[13.5px] font-medium text-white/45">{p.garantias}</p>
        </div>
      </section>

      {/* ================================================================
          LA VITRINA: ELEGÍ TU RUBRO
          ================================================================

          Sube como una hoja sobre el final de la franja oscura (el margen
          negativo), con un resplandor verde en el borde: se ve que es la
          parte que se toca. Es la ÚNICA fuente del rubro elegido: el
          celular, los tres beneficios, los planes con sus precios y el botón
          de prueba (que lleva el rubro a /crear) viven todos adentro de
          `ElegiTuRubro`. Por eso «Precios» apunta acá.

          Arranca en comercio en español y en el campo en portugués: los
          brasileños de Paraguay son sobre todo productores, y tienen que ver
          su lavoura sin tocar nada.

          LOS VIDEOS DEL 5/9 SE SACARON DE ACÁ (24/09). Mostraban el diseño
          de antes del 17/09, solo un comercio y solo en español, y un
          visitante en portugués veía otro producto. La vitrina los reemplaza.
          Los archivos siguen en `public/videos` y `src/lib/demos.ts` (con
          `Demos.tsx`): cuando se regraben, vuelven como una sección después
          de «Cómo se carga». */}
      <section
        id="rubros"
        aria-labelledby="titulo-rubros"
        className="relative -mt-10 scroll-mt-4 rounded-t-[2rem] border-t border-borde/60 bg-arena
                   shadow-[0_-24px_60px_-34px_rgba(72,220,130,.55)] lg:-mt-14 lg:rounded-t-[2.75rem]"
      >
        <div className="mx-auto max-w-6xl px-4 pb-14 pt-9 sm:px-5 lg:pt-12">
          <div className="mx-auto max-w-2xl text-center">
            <h2 id="titulo-rubros" className="text-[25px] font-titulo font-extrabold leading-tight tracking-tight lg:text-[33px]">
              {p.rubrosTitulo}
            </h2>
            <p className="mt-2 text-[15px] leading-relaxed text-tinta/60">{p.rubrosBajada}</p>
          </div>

          {/* El `id="precios"` (a donde lleva «Precios» de la barra) está
              adentro de la vitrina, en sus planes. */}
          <div className="mt-8">
            <ElegiTuRubro
              idioma={idioma}
              inicial={claveInicial(idioma)}
              preciosPYG={aVitrina(moneda)}
              referenciaUSD={aVitrina(MONEDA_DE_REFERENCIA)}
              diasPrueba={{ negocio: DIAS_DE_PRUEBA.emprendedor, personal: DIAS_DE_PRUEBA.personal }}
              promo={promoVitrina}
              precioPorVendedor={vendedorExtra}
              planesPorRubro={planesPorRubroDe(fichaDe)}
            />
          </div>

          {/* Va pegado a los precios porque cambia la cuenta de cuánto le
              sale a alguien: la comisión está en todos los planes, también
              mientras prueba (102: la mitad del precio de lista de un mes). */}
          <p className="mt-4 rounded-2xl bg-superficie px-4 py-3 text-[14px] leading-relaxed text-tinta/70">
            <Rico texto={p.recomendarEnPlanes} negrita="text-tinta" />{' '}
            <a href="#recomendar" className="font-semibold text-verde-fuerte hover:underline">
              {p.comoFunciona}
            </a>
          </p>
        </div>
      </section>

      {/* ================================================================
          CÓMO SE CARGA
          ================================================================

          A la izquierda las tres formas; a la derecha lo que la gente le
          dice, rotando entre rubros. Todas las frases son cosas que la
          captura entiende hoy (ver el comentario de `frases` en es.ts). */}
      <section aria-labelledby="titulo-cargar" className="border-t border-borde">
        <div className="mx-auto max-w-6xl px-4 py-14 sm:px-5">
          <div className="grid gap-10 lg:grid-cols-[1.05fr_1fr] lg:items-center">
            <div>
              <p className="titulo-seccion">{p.cargarEtiqueta}</p>
              <h2 id="titulo-cargar" className="mt-1.5 text-[25px] font-titulo font-extrabold leading-tight tracking-tight lg:text-[33px]">
                {p.cargarTitulo}
              </h2>
              <p className="mt-3 max-w-xl text-[15.5px] leading-relaxed text-tinta/60">{p.cargarBajada}</p>

              <ul className="mt-7 space-y-4">
                <Modo titulo={p.modoVoz} detalle={p.modoVozDetalle} icono={ICONO_VOZ} />
                <Modo titulo={p.modoFoto} detalle={p.modoFotoDetalle} icono={ICONO_FOTO} />
                <Modo titulo={p.modoTexto} detalle={p.modoTextoDetalle} icono={ICONO_TEXTO} />
              </ul>

              <p className="mt-6 max-w-xl text-[14.5px] leading-relaxed text-tinta/60">
                <Rico texto={p.deudasTambien} />
              </p>
            </div>

            {/* Lo que la gente le dice a Orden, un rubro por vez. */}
            <div className="tarjeta p-5 sm:p-6">
              <div className="flex items-center gap-2.5">
                <span className="relative grid h-9 w-9 place-items-center rounded-full bg-verde text-sobre-verde">
                  <span aria-hidden className="portada-pulso absolute -inset-1.5 rounded-full bg-verde/25" />
                  <svg viewBox="0 0 24 24" className="relative h-[18px] w-[18px]" fill="none" stroke="currentColor"
                       strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                    {ICONO_VOZ}
                  </svg>
                </span>
                <p className="text-[13px] font-bold uppercase tracking-[.12em] text-tinta/45">{p.loDijeronAsi}</p>
              </div>

              {/* La pausa (WCAG 2.2.2): una casilla sin JavaScript que deja las
                  cinco frases quietas, una debajo de la otra, como con «reducir
                  movimiento». Va ANTES de la lista porque el CSS la mira con `~`. */}
              <input type="checkbox" id="frases-quietas" className="portada-quietas sr-only" />
              <ul className="portada-frases mt-5">
                {p.frases.map((f, i) => (
                  <li
                    key={f.frase}
                    className="portada-frase"
                    style={{ animationDelay: `${i * SEGUNDOS_POR_FRASE}s` }}
                  >
                    <span className="pastilla bg-verde-claro text-verde-fuerte">{f.rubro}</span>
                    <p className="mt-2.5 text-[19px] font-semibold leading-snug tracking-tight text-tinta sm:text-[21px]">
                      {f.frase}
                    </p>
                    <p className="mt-2 flex items-center gap-1.5 text-[13px] font-semibold text-verde-fuerte">
                      <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 shrink-0" fill="none" stroke="currentColor"
                           strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                        <path d="m5 13 4 4L19 7" />
                      </svg>
                      {f.queda}
                    </p>
                  </li>
                ))}
              </ul>
              <label
                htmlFor="frases-quietas"
                className="portada-boton-quietas chip-apagado mt-4 cursor-pointer gap-2 px-3.5 text-[13px]"
              >
                <svg viewBox="0 0 24 24" className="h-4 w-4 shrink-0" fill="none" stroke="currentColor"
                     strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <path d="M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01" />
                </svg>
                {p.frasesVerTodas}
              </label>
            </div>
          </div>

          {/* ---- El cierre del día: solo comercio y servicios lo tienen
              (`cierraElDia` en rubros.ts), y la pastilla lo dice. ---- */}
          <div className="mt-14 grid gap-10 border-t border-borde pt-14 lg:grid-cols-2">
            <div>
              <span className="pastilla bg-arena text-tinta/60">{p.nocheEtiqueta}</span>
              <h3 className="mt-3 text-[22px] font-titulo font-extrabold leading-tight tracking-tight lg:text-[28px]">
                {p.nocheTitulo}
              </h3>
              <p className="mt-3 text-[15px] leading-relaxed text-tinta/65">
                <Rico texto={p.nocheBajada} />
              </p>
              <ul className="mt-5 space-y-3">
                {p.nochePuntos.map((linea) => (
                  <li key={linea} className="flex items-start gap-2.5 text-[14.5px] leading-relaxed text-tinta/70">
                    <Tilde />
                    {linea}
                  </li>
                ))}
              </ul>
            </div>

            {/* Números de ejemplo, fecha verdadera: el 12 de agosto de 2026
                es miércoles (decía martes). */}
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

      {/* ---------------- La franja de confianza ----------------
          Cuatro cosas que son ciertas y se pueden comprobar. No hay cantidad
          de usuarios ni testimonios: inventar un número en la portada de un
          sistema de plata es la forma más rápida de perder justamente lo que
          esta franja viene a dar. Se sacó «abre sin señal»: sin conexión
          Orden muestra un aviso, no deja trabajar. */}
      <section aria-labelledby="titulo-confianza" className="bg-noche text-white">
        <div className="mx-auto max-w-6xl px-4 pb-4 pt-10 sm:px-5">
          <h2 id="titulo-confianza" className="text-[12px] font-bold uppercase tracking-[.14em] text-white/40">
            {p.confianzaTitulo}
          </h2>
          <div className="grid grid-cols-2 gap-x-4 lg:grid-cols-4">
            <Dato valor={DATO_COMPROBACIONES} texto={p.datoPruebas} />
            <Dato valor="0" texto={p.datoAjenos} />
            <Dato valor={p.datoIdiomasValor} texto={p.datoIdiomas} />
            <Dato valor={p.datoCostosValor} texto={p.datoCostos} />
          </div>
        </div>
      </section>

      {/* ---------------- Preguntas frecuentes ----------------
          `<details>` del navegador: se abren con el teclado y los lectores
          de pantalla los entienden sin una línea de JavaScript. Respuestas
          cortas y verdaderas; si algo sigue en otra parte, un enlace. */}
      <section id="preguntas" aria-labelledby="titulo-preguntas" className="scroll-mt-4">
        <div className="mx-auto grid max-w-6xl gap-8 px-4 py-14 sm:px-5 lg:grid-cols-[0.8fr_1.2fr] lg:gap-12">
          <div>
            <p className="titulo-seccion">{p.preguntasEtiqueta}</p>
            <h2 id="titulo-preguntas" className="mt-1.5 text-[25px] font-titulo font-extrabold leading-tight tracking-tight lg:text-[33px]">
              {p.preguntasTitulo}
            </h2>
          </div>

          <div className="tarjeta divide-y divide-borde overflow-hidden">
            {preguntas.map((q) => (
              <details key={q.pregunta} className="group">
                <summary
                  className="flex min-h-[56px] cursor-pointer list-none items-center justify-between gap-4 px-5 py-4
                             text-[15.5px] font-bold leading-snug tracking-tight transition hover:bg-arena/60
                             focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2
                             focus-visible:outline-verde [&::-webkit-details-marker]:hidden"
                >
                  {q.pregunta}
                  <svg viewBox="0 0 24 24" className="h-4 w-4 shrink-0 text-tinta/40 transition-transform duration-200
                                                     group-open:rotate-180 motion-reduce:transition-none"
                       fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                    <path d="m6 9 6 6 6-6" />
                  </svg>
                </summary>
                <div className="px-5 pb-5 text-[14.5px] leading-relaxed text-tinta/65">
                  <Rico texto={q.respuesta} negrita="text-tinta" />
                  {q.enlace && (
                    <>
                      {' '}
                      {q.enlace.href.startsWith('#') ? (
                        <a href={q.enlace.href} className="font-semibold text-verde-fuerte hover:underline">
                          {q.enlace.texto}
                        </a>
                      ) : (
                        <Link href={q.enlace.href} className="font-semibold text-verde-fuerte hover:underline">
                          {q.enlace.texto}
                        </Link>
                      )}
                    </>
                  )}
                </div>
              </details>
            ))}
          </div>
        </div>
      </section>

      {/* ---------------- Ganar recomendando ----------------
          Va DESPUÉS de los precios y no antes: el que todavía no sabe cuánto
          cuesta no puede entender qué significa «la mitad del precio de su
          plan» (102: la comisión es sobre el precio de lista, no sobre lo que
          pagó con descuento). */}
      <section id="recomendar" className="scroll-mt-4 border-t border-borde bg-arena">
        <div className="mx-auto max-w-6xl px-4 py-14 sm:px-5">
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
          Es el mismo componente que se ve en /instalar y en Ajustes: se
          corrige en un solo lugar. */}
      <section id="instalar" className="scroll-mt-4 border-t border-borde">
        <div className="mx-auto max-w-6xl px-4 py-14 sm:px-5">
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
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-4 py-8 sm:px-5">
          <div className="flex items-center gap-2">
            <Marca clase="h-7 w-7" />
            <span className="text-[13.5px] font-semibold text-tinta/50">
              © Orden {new Date().getFullYear()}
            </span>
          </div>
          <nav className="flex flex-wrap gap-x-5 gap-y-1 text-[13.5px] font-semibold text-tinta/50">
            <Link href="/terminos" className="py-2 hover:text-tinta">{t.pantallas.terminos}</Link>
            <Link href="/privacidad" className="py-2 hover:text-tinta">{t.pantallas.privacidad}</Link>
            <Link href="/instalar" className="py-2 hover:text-tinta">{p.pieInstalar}</Link>
            <Link href="/ingresar" className="py-2 hover:text-tinta">{t.nav.miCuenta}</Link>
          </nav>
        </div>
      </footer>
    </main>
  );
}

/** Cuánto se ve cada frase de «Cómo se carga». La vuelta entera es cinco veces esto. */
const SEGUNDOS_POR_FRASE = 3.5;

/**
 * La rotación de las frases. Cada frase entra, se queda y sale dentro de su
 * 20 % del ciclo (cinco frases): por eso el diccionario tiene cinco y no más.
 * La caja tiene alto mínimo para la frase más larga en dos líneas: sin eso,
 * la página saltaría cada 3,5 s.
 *
 * Gira sin fin, así que tiene que poder pararse (WCAG 2.2.2, nivel A):
 * - con el puntero encima, la frase de ese momento se queda;
 * - la casilla «Ver todas» (#frases-quietas) las deja las cinco quietas, en
 *   lista, igual que «reducir movimiento». Es CSS puro: la página sigue
 *   siendo de servidor.
 * Con «reducir movimiento» la casilla no hace falta y se esconde.
 *
 * El pulso del micrófono da tres latidos (4,8 s) y se queda quieto: no
 * compite para siempre con el texto que se está leyendo.
 */
const CSS_FRASES = `
@keyframes portada-frase {
  0% { opacity: 0; transform: translateY(8px); }
  3%, 17% { opacity: 1; transform: none; }
  20%, 100% { opacity: 0; transform: translateY(-8px); }
}
.portada-frases { position: relative; min-height: 9.5rem; }
.portada-frase {
  position: absolute; inset: 0; opacity: 0;
  animation: portada-frase ${SEGUNDOS_POR_FRASE * 5}s ease-in-out infinite both;
}
.portada-frases:hover .portada-frase { animation-play-state: paused; }
.portada-quietas:checked ~ .portada-frases { min-height: 0; display: grid; gap: 1.25rem; }
.portada-quietas:checked ~ .portada-frases .portada-frase { position: static; opacity: 1; animation: none; }
.portada-quietas:checked ~ .portada-boton-quietas {
  border-color: rgb(var(--verde)); background-color: rgb(var(--verde)); color: rgb(var(--sobre-verde));
}
.portada-quietas:focus-visible ~ .portada-boton-quietas { outline: 2px solid rgb(var(--verde)); outline-offset: 2px; }
@keyframes portada-pulso { 50% { opacity: .35; } }
@media (prefers-reduced-motion: no-preference) {
  .portada-pulso { animation: portada-pulso 1.6s cubic-bezier(.4, 0, .6, 1) 3; }
}
@media (prefers-reduced-motion: reduce) {
  .portada-frases { min-height: 0; display: grid; gap: 1.25rem; }
  .portada-frase { position: static; opacity: 1; animation: none; }
  .portada-quietas, .portada-boton-quietas { display: none; }
}
`;

/** La respuesta sin `**` ni `_`, para los buscadores. Las mismas marcas que entiende `Rico`. */
function sinMarcas(texto: string): string {
  return texto.replace(/\*\*([^*]+)\*\*/g, '$1').replace(/_([^_]+)_/g, '$1');
}

const ICONO_VOZ = (
  <>
    <path d="M12 15a3 3 0 0 0 3-3V6a3 3 0 1 0-6 0v6a3 3 0 0 0 3 3Z" />
    <path d="M18.5 11.5A6.5 6.5 0 0 1 5.5 11.5M12 18v3" />
  </>
);
const ICONO_FOTO = (
  <path d="M3.5 8.5h3l1.5-2.5h8L17.5 8.5h3v10h-17z M12 13m-3.2 0a3.2 3.2 0 1 0 6.4 0a3.2 3.2 0 1 0-6.4 0" />
);
const ICONO_TEXTO = <path d="M4 6h16M4 12h16M4 18h10" />;

function Tilde() {
  return (
    <svg viewBox="0 0 24 24" className="mt-1 h-4 w-4 shrink-0 text-verde-fuerte" aria-hidden
         fill="none" stroke="currentColor" strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round">
      <path d="m5 13 4 4L19 7" />
    </svg>
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
    <div className="py-6 lg:pr-6">
      <p className="text-[24px] font-titulo font-extrabold tracking-tight text-menta lg:text-[30px]">{valor}</p>
      <p className="mt-1.5 text-[12.5px] leading-relaxed text-white/50">{texto}</p>
    </div>
  );
}

/** Una de las tres formas de cargar. */
function Modo({ titulo, detalle, icono }: { titulo: string; detalle: string; icono: React.ReactNode }) {
  return (
    <li className="flex items-start gap-3.5">
      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-verde-claro text-verde-fuerte">
        <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" aria-hidden
             strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round">
          {icono}
        </svg>
      </span>
      <div>
        <h3 className="text-[16px] font-bold tracking-tight">{titulo}</h3>
        <p className="mt-0.5 text-[14px] leading-relaxed text-tinta/60">{detalle}</p>
      </div>
    </li>
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
