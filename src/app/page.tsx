import Link from 'next/link';
import { redirect } from 'next/navigation';
import type { Metadata } from 'next';
import { clienteServidor } from '@/lib/supabase/servidor';
import { dinero } from '@/lib/formato';
import { textos, idiomaActual } from '@/i18n';
import { FICHA, MONEDA_DE_COBRO } from '@/i18n/idiomas';
import type { Precio } from '@/lib/tipos';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Orden · Sabé cuánto ganás de verdad',
  description:
    'Registrá tus ventas y gastos hablando, sacando una foto o escribiendo. '
    + 'Orden calcula tu ganancia real todos los días. Pensado para el que vende, no para el contador.',
  openGraph: {
    title: 'Orden · Sabé cuánto ganás de verdad',
    description: 'Registrá ventas y gastos en segundos. Mirá tu ganancia real todos los días.',
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
 * Tres reglas al escribirla:
 *
 *   · HABLA DEL PROBLEMA, NO DE LA TECNOLOGÍA. A nadie le importa que use
 *     IA. Le importa no saber cuánto ganó este mes.
 *   · LOS PRECIOS SALEN DE LA BASE. Si cambian en la tabla `precios`, esta
 *     página los muestra actualizados sin desplegar nada. Un precio escrito
 *     a mano acá sería el primero en quedar viejo y mentirle a alguien.
 *   · QUIEN YA ENTRÓ NO LA VE. Se lo manda derecho al panel.
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
  const precioDe = (plan: string) =>
    precios.find((p) => p.plan === plan && p.periodo === 'mensual') ?? null;

  const pro = precioDe('pro');
  const negocio = precioDe('negocio');

  return (
    <main className="min-h-screen bg-white">
      {/* ---------------- Barra ---------------- */}
      <header className="zona-segura-arriba border-b border-borde">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-5 py-4">
          <div className="flex items-center gap-2.5">
            <span className="grid h-9 w-9 place-items-center rounded-xl bg-verde text-base font-black text-white">o</span>
            <span className="text-[17px] font-bold tracking-tight">orden</span>
          </div>
          <Link href="/ingresar" className="boton-suave">Entrar</Link>
        </div>
      </header>

      {/* ---------------- Lo primero que se lee ---------------- */}
      <section className="mx-auto max-w-5xl px-5 pb-14 pt-12 lg:pt-20">
        <div className="max-w-2xl">
          <p className="titulo-seccion">Para el que vende todos los días</p>
          <h1 className="mt-3 text-[34px] font-bold leading-[1.1] tracking-tight lg:text-[52px]">
            ¿Sabés cuánto ganaste este mes?
          </h1>
          <p className="mt-5 text-[17px] leading-relaxed text-tinta/65 lg:text-[19px]">
            No cuánto vendiste: cuánto <strong className="text-tinta">te quedó</strong> después
            de lo que pagaste por la mercadería y de todos los gastos. Orden lo calcula solo,
            todos los días, y para cargarlo alcanza con contárselo.
          </p>

          <div className="mt-8 flex flex-wrap items-center gap-3">
            <Link href="/ingresar?crear=1" className="boton-principal px-6 py-3 text-[15px]">
              Probar 14 días gratis
            </Link>
            <span className="text-[13.5px] font-semibold text-tinta/45">
              Sin tarjeta · Cancelás cuando quieras
            </span>
          </div>
        </div>
      </section>

      {/* ---------------- Cómo se carga ---------------- */}
      <section className="border-y border-borde bg-arena">
        <div className="mx-auto max-w-5xl px-5 py-14">
          <h2 className="text-[22px] font-bold tracking-tight lg:text-[27px]">
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
        </div>
      </section>

      {/* ---------------- Qué te devuelve ---------------- */}
      <section className="mx-auto max-w-5xl px-5 py-14">
        <div className="grid gap-10 lg:grid-cols-2">
          <div>
            <h2 className="text-[22px] font-bold tracking-tight lg:text-[27px]">
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
      </section>

      {/* ---------------- Precios ---------------- */}
      <section className="border-t border-borde bg-arena">
        <div className="mx-auto max-w-5xl px-5 py-14">
          <h2 className="text-[22px] font-bold tracking-tight lg:text-[27px]">Cuánto cuesta</h2>
          <p className="mt-2 text-[15px] text-tinta/60">
            Catorce días de prueba, sin tarjeta. Después elegís, y si no querés seguir,
            tus datos quedan igual: podés seguir cargando a mano y ver todo tu historial.
          </p>

          <div className="mt-8 grid gap-4 md:grid-cols-3">
            <Plan
              nombre="Gratis"
              precio={dinero(0, moneda, true, locale)}
              para="Para probar y para quien carga poco"
              puntos={[
                'Todo tu historial, siempre',
                'Carga manual sin límite',
                '20 capturas con voz o foto por mes',
                '1 persona',
              ]}
            />
            <Plan
              destacado
              nombre="Pro"
              precio={pro ? dinero(Number(pro.importe), moneda, true, locale) : '—'}
              porMes
              para="Para el que vende todos los días"
              puntos={[
                'Voz, foto y texto sin tope',
                'Comprobantes guardados',
                'Excel de cinco hojas',
                'Hasta 3 personas',
              ]}
            />
            <Plan
              nombre="Negocio"
              precio={negocio ? dinero(Number(negocio.importe), moneda, true, locale) : '—'}
              porMes
              para="Para el local con empleados"
              puntos={[
                'Todo lo de Pro',
                'Hasta 15 personas con roles',
                'Cada uno carga con su cuenta',
                'Los costos los ve solo quien vos decidas',
              ]}
            />
          </div>

          <div className="mt-8">
            <Link href="/ingresar?crear=1" className="boton-principal px-6 py-3 text-[15px]">
              Empezar la prueba gratis
            </Link>
          </div>
        </div>
      </section>

      {/* ---------------- Pie ---------------- */}
      <footer className="zona-segura-abajo border-t border-borde">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-4 px-5 py-8">
          <div className="flex items-center gap-2">
            <span className="grid h-7 w-7 place-items-center rounded-lg bg-verde text-[13px] font-black text-white">o</span>
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

function Plan({
  nombre, precio, para, puntos, porMes = false, destacado = false,
}: {
  nombre: string;
  precio: string;
  para: string;
  puntos: string[];
  porMes?: boolean;
  destacado?: boolean;
}) {
  return (
    <div className={`tarjeta flex flex-col p-5 ${destacado ? 'border-verde/50 ring-1 ring-verde/20' : ''}`}>
      <h3 className="text-[16px] font-bold tracking-tight">{nombre}</h3>
      <p className="mt-2 flex items-baseline gap-1.5">
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
    </div>
  );
}
