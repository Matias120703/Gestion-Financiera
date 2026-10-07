import Link from 'next/link';
import { redirect } from 'next/navigation';
import type { Metadata } from 'next';
import { clienteServidor } from '@/lib/supabase/servidor';
import { textos, idiomaActual } from '@/i18n';
import { Marca } from '@/components/Marca';
import { BotonTema } from '@/components/BotonTema';
import { Rico } from '@/components/Rico';
import { ElegiTuRubro } from '@/components/portada/ElegiTuRubro';
import { SelectorIdiomaPortada } from '@/components/portada/SelectorIdiomaPortada';
import { EscenaCargar } from '@/components/portada/escenas/EscenaCargar';
import { EscenaNoche } from '@/components/portada/escenas/EscenaNoche';
import { EscenaRecomendar, type PlanDeEjemplo } from '@/components/portada/escenas/EscenaRecomendar';
import { EscenaInstalar } from '@/components/portada/escenas/EscenaInstalar';
import {
  claveInicial, planesPorRubroDe, type PrecioVitrina,
} from '@/components/portada/vitrina-datos';
import { fichaDe } from '@/lib/rubros';
import type { Precio } from '@/lib/tipos';
import { precio as precioTexto } from '@/lib/formato';
import { FICHA } from '@/i18n/idiomas';
import { vitrinaEs, vitrinaPt } from '@/i18n/textos/vitrina';
import {
  DIAS_DE_PRUEBA, LIMITES_VISIBLES, MONEDA_DE_REFERENCIA, PERSONAS_INCLUIDAS_PREMIUM, monedaDeCobro,
} from '@/lib/precios';

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

/** Una pregunta frecuente, como la devuelve `portada.preguntas`. */
type PreguntaFrecuente = { pregunta: string; respuesta: string; enlace?: { texto: string; href: string } };

/**
 * LA PORTADA (rehecha el 24/09; las escenas, el 02/10)
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
 * con sus precios cambian a los tuyos.
 *
 * LO QUE CAMBIÓ EL 02/10: lo que seguía a la vitrina era un muro de texto
 * («nadie te va a leer mil palabras», Matías). Ahora son cuatro ESCENAS
 * (`components/portada/escenas/`), cada una un título corto y, al lado, Orden
 * usándose: cargar hablando, con una foto o escribiendo; el cierre del día
 * que se enciende a la noche; recomendar y ver llegar la mitad al saldo; y
 * poner Orden en la pantalla de inicio, paso a paso, en iPhone y en Android.
 * Lo que se ve son las pantallas reales de Orden con datos de ejemplo, y se
 * tocan como en el celular. Son componentes de cliente; la primera pantalla,
 * la vitrina, las preguntas y el cierre de página siguen armándose acá, en el
 * servidor.
 *
 * Las reglas de siempre:
 *
 *   · HABLA DEL PROBLEMA, NO DE LA TECNOLOGÍA. A nadie le importa que use
 *     IA. Le importa no saber cuánto le quedó este mes.
 *   · LOS PRECIOS SALEN DE LA BASE (`lista_precios`, `promo_de_la_prueba`,
 *     `precio_por_vendedor`) y los planes de cada rubro de su ficha
 *     (`fichaDe(rubro).planes`, espejo de `planes_de_rubro()`). Un precio
 *     escrito a mano acá sería el primero en quedar viejo y mentirle a
 *     alguien. La comisión de ejemplo de recomendar también sale de ahí.
 *   · NADA QUE NO SEA VERDAD. Cada frase y cada pantalla dibujada se
 *     sostiene con lo que Orden hace hoy. Si algo deja de ser cierto, se saca.
 *   · QUIEN YA ENTRÓ NO LA VE. Se lo manda derecho al panel.
 *
 * Los textos viven en el diccionario (`portada`, `vitrina.ts` para la
 * vitrina y `textos/escenas/*.ts` para cada escena), en español y en
 * portugués. Acá solo queda la estructura.
 */
export default async function Portada() {
  // Con sesión, esta página no aporta nada: al panel.
  const supabase = clienteServidor();
  const { data: { user } } = await supabase.auth.getUser();
  if (user) redirect('/panel');

  const t = await textos();
  const p = t.portada;
  const idioma = await idiomaActual();
  const v = idioma === 'pt' ? vitrinaPt : vitrinaEs;

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
   * Los números de las promos (078, 093, 123) salen de `ajustes_orden`, que
   * es donde se editan sin desplegar. Si la lectura falla quedan los de por
   * defecto: decir un número equivocado sería peor que no decirlo.
   *
   * Desde la 123 (02/10/2026) la cuenta personal tiene su propio porcentaje
   * (`porcentaje_personal`); `porcentaje` es el del negocio.
   */
  const leida = (promo ?? null) as {
    porcentaje?: number; porcentaje_personal?: number; negocio?: number; personal?: number;
    constancia_porcentaje?: number; constancia_dias?: number;
  } | null;
  const promoVitrina = {
    porcentaje: Math.round(Number(leida?.porcentaje ?? 18)),
    porcentajePersonal: Math.round(Number(leida?.porcentaje_personal ?? 5)),
    negocio: Number(leida?.negocio ?? DIAS_DE_PRUEBA.emprendedor),
    personal: Number(leida?.personal ?? DIAS_DE_PRUEBA.personal),
    constanciaPorcentaje: Math.round(Number(leida?.constancia_porcentaje ?? 5)),
    constanciaDias: Number(leida?.constancia_dias ?? 30),
  };

  const vendedorExtra = porVendedor != null && Number.isFinite(Number(porVendedor))
    ? Number(porVendedor)
    : null;

  /**
   * EL PREMIUM, CON SUS NÚMEROS (123, 02/10/2026): cuántas personas trae su
   * precio, hasta cuántas llega y cuánto suma cada una de más. El importe por
   * persona sale de `precio_por_vendedor()` y el del plan de `lista_precios`;
   * las personas, de los mismos espejos que usa /plan. Si un importe no se
   * leyó, la pregunta frecuente lo dice sin número.
   */
  const premium = {
    incluidas: PERSONAS_INCLUIDAS_PREMIUM,
    tope: LIMITES_VISIBLES.negocio.miembros,
  };
  const localeDeLaPortada = FICHA[idioma === 'pt' ? 'pt' : 'es'].locale;
  const precioPremium = todos.find((x) => x.moneda === moneda && x.tipo_cuenta === 'emprendedor'
    && x.plan === 'negocio' && x.periodo === 'mensual');
  const enGuaranies = (n: number | null) =>
    (n !== null && Number.isFinite(n) && n > 0 ? precioTexto(n, moneda, localeDeLaPortada) : null);

  /**
   * LA COMISIÓN DE EJEMPLO DE RECOMENDAR, CON EL MONTO VERDADERO (102, 105):
   * la mitad del precio de lista MENSUAL del plan que activó el invitado, en
   * guaraníes, con su primer pago, una sola vez por cuenta. El porcentaje vive
   * en `ajustes_orden.comision_porcentaje` y ninguna RPC pública lo trae: «la
   * mitad» está escrita en los textos (la portada, Invitaciones, los términos)
   * y el `/ 2` se escribe UNA sola vez, acá. Si algún día cambia en la base,
   * hay que tocar los textos y esta cuenta a la vez.
   *
   * Si un precio no se leyó, ese plan no tiene chip en la escena; si no se
   * leyó ninguno, la escena dice «la mitad del precio de su plan» sin número.
   */
  const listaMensual = (tipo: 'emprendedor' | 'personal', plan: 'basico' | 'pro' | 'negocio'): number | null => {
    const fila = todos.find((x) => x.moneda === moneda && x.tipo_cuenta === tipo && x.plan === plan && x.periodo === 'mensual');
    const n = fila ? Number(fila.importe) : NaN;
    return Number.isFinite(n) && n > 0 ? n : null;
  };
  const planesSinMitad: Omit<PlanDeEjemplo, 'mitad'>[] = [
    { clave: 'basico', nombre: v.nombresPlan.basico, lista: listaMensual('emprendedor', 'basico') },
    { clave: 'pro', nombre: v.nombresPlan.pro, lista: listaMensual('emprendedor', 'pro') },
    { clave: 'negocio', nombre: v.nombresPlan.negocio, lista: listaMensual('emprendedor', 'negocio') },
    { clave: 'personal', nombre: `${v.nombrePersonal} · ${p.cuentaPersonal}`, lista: listaMensual('personal', 'pro') },
  ];
  const planesEjemplo: PlanDeEjemplo[] = planesSinMitad.map((x) => ({ ...x, mitad: x.lista === null ? null : x.lista / 2 }));

  const preguntas: PreguntaFrecuente[] = p.preguntas(
    { negocio: DIAS_DE_PRUEBA.emprendedor, personal: DIAS_DE_PRUEBA.personal },
    {
      pro: LIMITES_VISIBLES.pro.miembros,
      incluidas: premium.incluidas,
      tope: premium.tope,
      premium: enGuaranies(precioPremium ? Number(precioPremium.importe) : null),
      porPersona: enGuaranies(vendedorExtra),
    },
  );

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
            Dónde lo usás arriba, chico, y la pregunta de siempre abajo,
            grande: Orden cambia según lo que hacés, lo que te responde no. */}
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
              premium={premium}
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
          LAS CUATRO ESCENAS (02/10/2026)
          ================================================================

          Cada una es un título corto y Orden usándose al lado, con sus
          pantallas reales y datos de ejemplo; se tocan como en el celular y
          nada gira sin fin (una entrada corta al verse, y después manda el
          dedo). Van en zigzag —celular a la derecha, cierre a la izquierda,
          tira a todo el ancho, teléfono a la izquierda— y alternan fondos:
          en tema oscuro `arena` y `noche` son el mismo color, y con este
          orden nunca quedan dos franjas iguales pegadas.

          Recomendar va DESPUÉS de los precios y no antes: el que todavía no
          sabe cuánto cuesta no puede entender qué significa «la mitad del
          precio de su plan». Sube como hoja sobre la noche, igual que la
          vitrina sobre la primera pantalla. */}
      <EscenaCargar idioma={idioma} />
      <EscenaNoche idioma={idioma} />
      <EscenaRecomendar
        idioma={idioma}
        diasNegocio={DIAS_DE_PRUEBA.emprendedor}
        diasPersonal={DIAS_DE_PRUEBA.personal}
        planes={planesEjemplo}
      />
      <EscenaInstalar idioma={idioma} />

      {/* ---------------- Preguntas frecuentes ----------------
          `<details>` del navegador: se abren con el teclado y los lectores
          de pantalla los entienden sin una línea de JavaScript. Respuestas
          cortas y verdaderas; si algo sigue en otra parte, un enlace. Diez
          preguntas en dos tarjetas de cinco: la cabecera centrada, como en
          las escenas, y sin animación. */}
      <section id="preguntas" aria-labelledby="titulo-preguntas" className="scroll-mt-4 bg-superficie">
        <div className="mx-auto max-w-6xl px-4 py-16 sm:px-5 lg:py-20">
          <div className="mx-auto max-w-2xl text-center">
            <p className="titulo-seccion">{p.preguntasEtiqueta}</p>
            <h2
              id="titulo-preguntas"
              className="mt-2 font-titulo text-[28px] font-extrabold leading-[1.08] tracking-tight sm:text-[34px]"
            >
              {p.preguntasTitulo}
            </h2>
          </div>

          <div className="mt-8 grid gap-4 lg:grid-cols-2 lg:items-start">
            {[preguntas.slice(0, 5), preguntas.slice(5)].map((grupo) => (
              <div key={grupo[0]?.pregunta} className="tarjeta divide-y divide-borde overflow-hidden">
                {grupo.map((q) => <Pregunta key={q.pregunta} q={q} />)}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ---------------- El cierre de la página: confianza + prueba ----------------
          Cuatro cosas que son ciertas y se pueden comprobar, y el botón de la
          prueba por última vez. No hay cantidad de usuarios ni testimonios:
          inventar un número en la portada de un sistema de plata es la forma
          más rápida de perder justamente lo que esta franja viene a dar. Se
          sacó «abre sin señal»: sin conexión Orden muestra un aviso, no deja
          trabajar. */}
      <section aria-labelledby="titulo-confianza" className="relative overflow-hidden bg-noche text-white">
        {/* El resplandor, abajo al centro: el mismo de la primera pantalla, para cerrar como se abrió. */}
        <div aria-hidden className="pointer-events-none absolute inset-0">
          <div
            className="absolute -bottom-56 left-1/2 h-[32rem] w-[44rem] -translate-x-1/2 rounded-full opacity-60 blur-3xl"
            style={{ background: 'radial-gradient(circle, rgba(40,180,100,.55) 0%, rgba(40,180,100,0) 70%)' }}
          />
        </div>
        <div className="relative mx-auto max-w-6xl px-4 py-14 sm:px-5 lg:py-20">
          <h2 id="titulo-confianza" className="text-center text-[12px] font-bold uppercase tracking-[.14em] text-white/40">
            {p.confianzaTitulo}
          </h2>
          <div className="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Dato valor={DATO_COMPROBACIONES} texto={p.datoPruebas} />
            <Dato valor="0" texto={p.datoAjenos} />
            <Dato valor={p.datoIdiomasValor} texto={p.datoIdiomas} />
            <Dato valor={p.datoCostosValor} texto={p.datoCostos} />
          </div>

          <div className="mt-12 flex flex-col items-center gap-4 text-center">
            <Link
              href="/crear"
              className="rounded-xl bg-menta px-7 py-3.5 text-[15px] font-bold text-noche shadow-lg
                         shadow-menta/20 transition hover:bg-menta-suave"
            >
              {p.probarGratis(diasNegocio)}
            </Link>
            <p className="text-[13.5px] font-medium text-white/45">{p.garantias}</p>
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

/** La respuesta sin `**` ni `_`, para los buscadores. Las mismas marcas que entiende `Rico`. */
function sinMarcas(texto: string): string {
  return texto.replace(/\*\*([^*]+)\*\*/g, '$1').replace(/_([^_]+)_/g, '$1');
}

/**
 * Un dato de la franja de confianza, en su ficha.
 *
 * Todos tienen que ser comprobables. El día que uno deje de ser cierto se
 * saca: es preferible una franja de tres que un número que no se sostiene
 * si alguien pregunta.
 */
function Dato({ valor, texto }: { valor: string; texto: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
      <p className="font-titulo text-[24px] font-extrabold tracking-tight text-menta lg:text-[30px]">{valor}</p>
      <p className="mt-1.5 text-[12.5px] leading-relaxed text-white/50">{texto}</p>
    </div>
  );
}

/** Una pregunta frecuente: un `<details>` nativo, con el enlace al final si la respuesta sigue en otra parte. */
function Pregunta({ q }: { q: PreguntaFrecuente }) {
  return (
    <details className="group">
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
  );
}
