'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { clienteNavegador } from '@/lib/supabase/cliente';
import { COOKIE_EMPRESA } from '@/lib/constantes';
import type { Empresa, Rubro, TipoCuenta } from '@/lib/tipos';
import { fichaDe, palabra, type Seccion } from '@/lib/rubros';
import { useTextos } from '@/i18n/cliente';
import { Marca } from '@/components/Marca';
import { useBloquearFondo } from '@/lib/fondo';
import type { Textos } from '@/i18n/diccionarios';

export interface ItemNav { href: Seccion; texto: string; icono: React.ReactNode }

const trazo = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.7, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };

const Ico = {
  panel: (
    <svg viewBox="0 0 24 24" className="h-[21px] w-[21px]" {...trazo}>
      <path d="M3 12l9-8 9 8" /><path d="M5 10.5V20h14v-9.5" /><path d="M9.5 20v-5h5v5" />
    </svg>
  ),
  vender: (
    <svg viewBox="0 0 24 24" className="h-[21px] w-[21px]" {...trazo}>
      <circle cx="12" cy="12" r="9" /><path d="M12 7.5v9M14.8 9.6c-.5-.8-1.5-1.3-2.8-1.3-1.6 0-2.7.8-2.7 2 0 2.8 5.6 1.4 5.6 4.2 0 1.2-1.2 2-2.9 2-1.4 0-2.4-.5-2.9-1.4" />
    </svg>
  ),
  gastos: (
    <svg viewBox="0 0 24 24" className="h-[21px] w-[21px]" {...trazo}>
      <path d="M3.5 7.5h17v11a1.5 1.5 0 0 1-1.5 1.5H5a1.5 1.5 0 0 1-1.5-1.5z" />
      <path d="M3.5 7.5 6 4h12l2.5 3.5M9 12h6" />
    </svg>
  ),
  productos: (
    <svg viewBox="0 0 24 24" className="h-[21px] w-[21px]" {...trazo}>
      <path d="M12 3 4 7v10l8 4 8-4V7z" /><path d="m4 7 8 4 8-4M12 11v10" />
    </svg>
  ),
  lotes: (
    <svg viewBox="0 0 24 24" className="h-[21px] w-[21px]" {...trazo}>
      <path d="m12 3 8 4.5-8 4.5-8-4.5z" /><path d="m4 12 8 4.5 8-4.5" />
      <path d="m4 16.5 8 4.5 8-4.5" />
    </svg>
  ),
  movimientos: (
    <svg viewBox="0 0 24 24" className="h-[21px] w-[21px]" {...trazo}>
      <path d="M4 6h16M4 12h16M4 18h10" />
    </svg>
  ),
  reto: (
    <svg viewBox="0 0 24 24" className="h-[21px] w-[21px]" {...trazo}>
      <circle cx="12" cy="12" r="8.5" /><circle cx="12" cy="12" r="4.5" /><circle cx="12" cy="12" r="1" />
    </svg>
  ),
  reportes: (
    <svg viewBox="0 0 24 24" className="h-[21px] w-[21px]" {...trazo}>
      <path d="M5 20V10M12 20V4M19 20v-7" />
    </svg>
  ),
  cierre: (
    <svg viewBox="0 0 24 24" className="h-[21px] w-[21px]" {...trazo}>
      <circle cx="12" cy="12" r="8.5" /><path d="M12 7.5V12l3 1.8" />
    </svg>
  ),
  organizacion: (
    <svg viewBox="0 0 24 24" className="h-[21px] w-[21px]" {...trazo}>
      <path d="M4 6.5h16v13H4z" /><path d="M4 10.5h16" /><path d="M9 10.5v9" />
      <path d="M8 3.5v3M16 3.5v3" />
    </svg>
  ),
  billetera: (
    <svg viewBox="0 0 24 24" className="h-[21px] w-[21px]" {...trazo}>
      <path d="M4 7.5A2.5 2.5 0 0 1 6.5 5H17v3" />
      <path d="M4 7.5V17a2 2 0 0 0 2 2h13a1 1 0 0 0 1-1v-9a1 1 0 0 0-1-1H6.5A2.5 2.5 0 0 1 4 7.5Z" />
      <circle cx="16" cy="13.5" r="1.1" />
    </svg>
  ),
  deudas: (
    <svg viewBox="0 0 24 24" className="h-[21px] w-[21px]" {...trazo}>
      <path d="M3.5 7.5h17v9a1.5 1.5 0 0 1-1.5 1.5H5a1.5 1.5 0 0 1-1.5-1.5z" />
      <circle cx="12" cy="12" r="2.4" /><path d="M6.5 12h.01M17.5 12h.01" />
    </svg>
  ),
  mas: (
    <svg viewBox="0 0 24 24" className="h-[21px] w-[21px]" {...trazo}>
      <circle cx="5" cy="12" r="1.4" /><circle cx="12" cy="12" r="1.4" /><circle cx="19" cy="12" r="1.4" />
    </svg>
  ),
  plan: (
    <svg viewBox="0 0 24 24" className="h-[21px] w-[21px]" {...trazo}>
      <path d="M3.5 8.5h17v9a1.5 1.5 0 0 1-1.5 1.5H5a1.5 1.5 0 0 1-1.5-1.5z" />
      <path d="M3.5 11.5h17M7 15.5h3" /><path d="M6.5 8.5V6.8A1.3 1.3 0 0 1 7.8 5.5h8.4a1.3 1.3 0 0 1 1.3 1.3v1.7" />
    </svg>
  ),
  // Un nodo que reparte a otros dos: es compartir, no regalar. El regalo
  // prometería algo que esto no es.
  recomendar: (
    <svg viewBox="0 0 24 24" className="h-[21px] w-[21px]" {...trazo}>
      <circle cx="17.5" cy="6" r="2.5" /><circle cx="17.5" cy="18" r="2.5" />
      <circle cx="6" cy="12" r="2.5" />
      <path d="m8.3 10.9 6.9-3.5M8.3 13.1l6.9 3.5" />
    </svg>
  ),
  equipo: (
    <svg viewBox="0 0 24 24" className="h-[21px] w-[21px]" {...trazo}>
      <circle cx="9" cy="8" r="3.2" />
      <path d="M3.2 19.5c0-3.1 2.6-5.3 5.8-5.3s5.8 2.2 5.8 5.3" />
      <path d="M16.4 5.2a3.2 3.2 0 0 1 0 5.6" />
      <path d="M17.6 14.6c1.9.6 3.2 2.3 3.2 4.9" />
    </svg>
  ),
  ajustes: (
    <svg viewBox="0 0 24 24" className="h-[21px] w-[21px]" {...trazo}>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 2.8v2.4M12 18.8v2.4M21.2 12h-2.4M5.2 12H2.8M18.5 5.5l-1.7 1.7M7.2 16.8l-1.7 1.7M18.5 18.5l-1.7-1.7M7.2 7.2 5.5 5.5" />
    </svg>
  ),
  // La libreta del fiado: la de siempre, la del almacén.
  fiado: (
    <svg viewBox="0 0 24 24" className="h-[21px] w-[21px]" {...trazo}>
      <rect x="5" y="3.5" width="14" height="17" rx="2" />
      <path d="M9 8.5h6M9 12h6M9 15.5h3.5" />
    </svg>
  ),
  clientes: (
    <svg viewBox="0 0 24 24" className="h-[21px] w-[21px]" {...trazo}>
      <circle cx="9" cy="8.5" r="3.2" />
      <path d="M3.5 19c.6-3 2.8-4.8 5.5-4.8s4.9 1.8 5.5 4.8" />
      <circle cx="16.8" cy="9.5" r="2.4" />
      <path d="M16.6 14.4c2 .2 3.4 1.7 3.9 4.1" />
    </svg>
  ),
  // El anillo de la marca. Es el panel de Orden, no una sección del negocio,
  // y el ícono lo dice antes de que se lea el texto.
  orden: (
    <svg viewBox="0 0 24 24" className="h-[21px] w-[21px]" {...trazo}>
      <circle cx="12" cy="12" r="7.5" />
      <path d="M12 8.2v7.6" />
    </svg>
  ),
};

/**
 * Los ítems salen del diccionario, no de una constante: el nombre de cada
 * pantalla cambia con el idioma. La ruta y el icono no cambian nunca, así
 * que lo único que se arma en cada render es el texto.
 */
/**
 * Lo que existe SOLO en una cuenta personal.
 *
 * Organización es la contracara del cierre del día: donde un comercio mira
 * cómo le fue hoy, una persona mira si llega a fin de mes.
 */
/**
 * Lo que es de LA EMPRESA y no del trabajo de todos los días.
 *
 * Un vendedor vende, carga gastos, gestiona productos y ve su agenda y su
 * parte del reparto. Cuánto debe el negocio, si hoy cerró bien, la meta del
 * mes y los reportes financieros son la vista del dueño, no la suya — y no
 * es solo prolijidad: ocultarlo evita que alguien piense que ese número lo
 * describe a él. La protección real está en cada página (`ctx.esAdmin`);
 * esto es que el menú no lo ofrezca.
 */
const SOLO_ADMIN: Seccion[] = ['/deudas', '/cierre', '/movimientos', '/reto', '/reportes', '/billetera'];

/**
 * Las secciones del menú, con las palabras de cada rubro.
 *
 * El reemplazo de vocabulario existía en `rubros.ts` desde que se creó el
 * módulo de rubros y NUNCA se había llamado desde ningún lado: la función
 * estaba escrita, probada de palabra y muerta. Por eso a un ganadero le
 * seguía diciendo «Productos» en vez de «Hacienda», y a un agricultor en
 * vez de «Cultivos».
 *
 * Hay una prueba que comprueba que se siga llamando, porque un mecanismo
 * que nadie usa no da error: simplemente no pasa nada, y eso es lo difícil
 * de notar.
 */
export function itemsDe(
  t: Textos,
  tipo: TipoCuenta = 'emprendedor',
  rubro: Rubro = 'comercio',
  esAdmin: boolean = true,
  idioma: string = 'es',
): ItemNav[] {
  const suPalabra = (clave: 'vender' | 'productos' | 'ventas' | 'clientes' | 'fiado', porDefecto: string) =>
    palabra(rubro, tipo, clave, porDefecto, idioma);

  const todos: ItemNav[] = [
    { href: '/panel',       texto: t.nav.panel,       icono: Ico.panel },
    { href: '/vender',      texto: suPalabra('vender', t.nav.vender), icono: Ico.vender },
    { href: '/gastos',      texto: t.nav.gastos,      icono: Ico.gastos },
    { href: '/deudas',      texto: t.nav.deudas,      icono: Ico.deudas },
    { href: '/billetera',   texto: t.nav.billetera,   icono: Ico.billetera },
    // «Fiado» es la palabra del mostrador; a una persona no se le fía, le
    // deben. Mismo módulo, la palabra de cada uno.
    { href: '/fiado',       texto: tipo === 'personal' ? t.nav.meDeben : suPalabra('fiado', t.nav.fiado), icono: Ico.fiado },
    { href: '/clientes',    texto: suPalabra('clientes', t.nav.clientes), icono: Ico.clientes },
    { href: '/cierre',      texto: t.nav.cierre,      icono: Ico.cierre },
    { href: '/productos',   texto: suPalabra('productos', t.nav.productos), icono: Ico.productos },
    { href: '/lotes',       texto: t.nav.lotes,       icono: Ico.lotes },
    { href: '/movimientos', texto: t.nav.historial,   icono: Ico.movimientos },
    { href: '/reto',        texto: t.nav.reto,        icono: Ico.reto },
    { href: '/organizacion', texto: t.nav.organizacion, icono: Ico.organizacion },
    { href: '/agenda',      texto: t.nav.agenda,      icono: Ico.cierre },
    { href: '/reparto',     texto: t.nav.reparto,     icono: Ico.equipo },
    { href: '/reportes',    texto: t.nav.reportes,    icono: Ico.reportes },
    { href: '/ajustes',     texto: t.nav.ajustes,     icono: Ico.ajustes },
  ];
  // UN solo filtro, y sale de la ficha. Antes eran dos —uno por tipo de
  // cuenta y otro por rubro— y ahí estuvo el error que se arrastró meses: a
  // una cuenta personal se le guarda rubro 'comercio', así que el filtro por
  // rubro le daba la ficha de un almacén y le dejaba el cierre del día. La
  // ficha ahora contesta las dos cosas junto; ver src/lib/rubros.ts.
  const ficha = fichaDe(rubro, tipo);
  const visibles = todos.filter((i) => ficha.secciones[i.href]);
  // Una cuenta personal es de una sola persona (la 019 impide sumar gente),
  // así que este filtro nunca la afecta: solo achica el menú de un vendedor
  // dentro de un negocio.
  return esAdmin ? visibles : visibles.filter((i) => !SOLO_ADMIN.includes(i.href));
}

/**
 * Qué va fijo en la barra de abajo del celular.
 *
 * Son CUATRO y no las nueve, y no es por ahorrar: en un celular de 375 px,
 * nueve iconos quedan a 41 px cada uno. El mínimo para tocar sin errar con el
 * pulgar es 44, y las etiquetas no entrarían. El quinto lugar es «Más», que
 * abre TODAS las secciones —incluidas estas cuatro— en una hoja con espacio
 * de sobra. Todo queda a un toque, que es lo que importa.
 *
 * Estas cuatro son las de todos los días: mirar cómo va, vender, cargar un
 * gasto y cerrar el día. Productos, reportes y ajustes se tocan de vez en
 * cuando y casi siempre sentado.
 */
const EN_BARRA_INFERIOR: Seccion[] = ['/panel', '/vender', '/gastos', '/cierre'];
const EN_BARRA_INFERIOR_VENDEDOR: Seccion[] = ['/panel', '/vender', '/gastos', '/agenda'];

/**
 * En una cuenta personal, el lugar de Vender lo ocupa Deudas.
 *
 * No es un relleno: para alguien que lleva sus finanzas, saber cuánto debe y
 * cuándo vence la cuota es lo que más se mira. Es la pantalla que justifica
 * la suscripción, así que va a un toque.
 */
const EN_BARRA_INFERIOR_PERSONAL: Seccion[] = ['/panel', '/deudas', '/gastos', '/organizacion'];

function barraDe(tipo: TipoCuenta, rubro: Rubro = 'comercio', esAdmin: boolean = true) {
  const base = tipo === 'personal'
    ? EN_BARRA_INFERIOR_PERSONAL
    : esAdmin ? EN_BARRA_INFERIOR : EN_BARRA_INFERIOR_VENDEDOR;
  // Si la cuenta no tiene alguna de las cuatro, se cae sola: la barra queda
  // de tres y el resto sigue a un toque desde «Más».
  const ficha = fichaDe(rubro, tipo);
  return base.filter((href) => ficha.secciones[href]);
}

function activo(ruta: string, href: string) {
  return ruta === href || ruta.startsWith(`${href}/`);
}

/**
 * EL ENLACE AL PANEL DE ORDEN
 *
 * El panel de administración se decidió no anunciarlo en ningún lado: «una
 * puerta que anuncia que está cerrada invita a golpearla». Esto no rompe esa
 * regla, la respeta — el enlace SOLO se dibuja para quien ya está en la tabla
 * `superadmins`. Un cliente nunca lo ve ni se entera de que existe.
 *
 * Y no habilita nada: cada función del panel exige `es_superadmin()` en
 * PostgreSQL. Si alguien fuerza el enlace, la pantalla lo manda a su propio
 * panel sin decirle por qué.
 */
export function NavLateral({
  empresa, esAdmin = true, administraOrden = false,
}: {
  empresa: Empresa;
  esAdmin?: boolean;
  administraOrden?: boolean;
}) {
  const ruta = usePathname();
  const t = useTextos();
  const ITEMS = itemsDe(t, empresa.tipo_cuenta, empresa.rubro, esAdmin);
  return (
    <aside className="hidden w-[232px] shrink-0 flex-col border-r border-borde bg-superficie lg:flex">
      <div className="flex items-center gap-2.5 px-5 py-5">
        <Marca clase="h-9 w-9" />
        <div className="min-w-0">
          <p className="truncate text-[15px] font-bold leading-tight tracking-tight">{empresa.nombre}</p>
          <p className="text-[11px] font-semibold uppercase tracking-wider text-tinta/40">{empresa.moneda}</p>
        </div>
      </div>

      <nav className="flex-1 space-y-0.5 px-3 py-2">
        {ITEMS.map((i) => (
          <Link
            key={i.href} href={i.href}
            className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-[14.5px] font-semibold transition ${
              activo(ruta, i.href) ? 'bg-verde-claro text-verde-fuerte' : 'text-tinta/60 hover:bg-arena hover:text-tinta'
            }`}
          >
            {i.icono}
            {i.texto}
          </Link>
        ))}

        {/* Recomendar no es una sección del negocio: es un extra de la
            persona. Va abajo de todo, después de una línea, y en la barra del
            celular está en el mismo lugar —el menú «Más»—. Estuvo solo en el
            celular por un descuido: en la computadora, que es donde se trabaja
            sentado, no aparecía. */}
        <div className="my-2 border-t border-borde" />
        <Link
          href="/recomendar"
          className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-[14.5px] font-semibold transition ${
            activo(ruta, '/recomendar') ? 'bg-verde-claro text-verde-fuerte' : 'text-tinta/60 hover:bg-arena hover:text-tinta'
          }`}
        >
          {Ico.recomendar}
          {t.nav.recomendar}
        </Link>

        {administraOrden && (
          <>
            {/* Separado del resto: no es una sección del negocio, es otra
                cosa. Que se note evita el susto de creer que se está mirando
                la propia cuenta cuando se está mirando la de un cliente. */}
            <div className="my-2 border-t border-borde" />
            <Link
              href="/admin"
              className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-[14.5px] font-semibold transition ${
                activo(ruta, '/admin') ? 'bg-verde-claro text-verde-fuerte' : 'text-tinta/60 hover:bg-arena hover:text-tinta'
              }`}
            >
              {Ico.orden}
              {t.nav.panelOrden}
            </Link>
          </>
        )}
      </nav>
    </aside>
  );
}

/**
 * LA LENTE DE VIDRIO DE LA BARRA, COMO EN IPHONE.
 *
 * Matías mandó la captura de WhatsApp en iPhone: mantenés apretada la barra
 * de abajo, aparece una burbuja de vidrio que sigue el dedo, agranda los
 * íconos que tiene debajo y tiene el borde tornasolado. Al soltar, te lleva a
 * la sección donde quedó.
 *
 * CÓMO SE DISTINGUE UN TOQUE DE UN ARRASTRE
 *
 * Un toque sigue siendo un toque: el enlace hace lo suyo, y la lente solo
 * aparece un instante. Recién cuando el dedo se corre más de 6 px es un
 * arrastre: la lente sigue el dedo y al soltar se navega desde acá, y el
 * clic que el navegador dispara después se descarta para no navegar dos
 * veces.
 *
 * Con «reducir movimiento» encendido en el teléfono no hay lente: la barra
 * funciona igual, con toques.
 */
function useLenteDeVidrio(columnas: number, alSoltar: (indice: number) => void) {
  const barra = useRef<HTMLDivElement>(null);
  const gesto = useRef<{ id: number; inicioX: number; arrastra: boolean } | null>(null);
  const ignorarClic = useRef(false);
  const [estado, setEstado] = useState<{
    x: number; indice: number; anchoLente: number; anchoBarra: number; altoBarra: number; soltando: boolean;
  } | null>(null);

  const medir = (clienteX: number) => {
    const el = barra.current;
    if (!el) return null;
    const r = el.getBoundingClientRect();
    const borde = 6;
    const celda = (r.width - borde * 2) / columnas;
    // La lente no se sale de la barra: frena en el primer y el último botón.
    const x = Math.min(Math.max(clienteX - r.left, borde + celda / 2), r.width - borde - celda / 2);
    const indice = Math.min(columnas - 1, Math.max(0, Math.floor((x - borde) / celda)));
    return { x, indice, celda, borde, anchoBarra: r.width, altoBarra: r.height };
  };

  const reducido = () => typeof window !== 'undefined'
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const eventos = {
    onPointerDown: (e: React.PointerEvent<HTMLDivElement>) => {
      if (reducido() || (e.pointerType === 'mouse' && e.button !== 0)) return;
      const m = medir(e.clientX);
      if (!m) return;
      gesto.current = { id: e.pointerId, inicioX: e.clientX, arrastra: false };
      setEstado({
        x: m.x, indice: m.indice, anchoLente: m.celda * 1.6,
        anchoBarra: m.anchoBarra, altoBarra: m.altoBarra, soltando: false,
      });
    },
    onPointerMove: (e: React.PointerEvent<HTMLDivElement>) => {
      const g = gesto.current;
      if (!g || g.id !== e.pointerId) return;
      if (!g.arrastra && Math.abs(e.clientX - g.inicioX) > 6) {
        g.arrastra = true;
        // Desde acá el dedo es de la barra aunque se salga un poco de ella.
        try { barra.current?.setPointerCapture(e.pointerId); } catch { /* sin captura igual anda */ }
      }
      if (!g.arrastra) return;
      const m = medir(e.clientX);
      if (!m) return;
      setEstado((s) => {
        if (!s) return s;
        // Un golpecito al pasar de un botón a otro, donde el teléfono lo permite.
        if (m.indice !== s.indice) navigator.vibrate?.(6);
        return { ...s, x: m.x, indice: m.indice };
      });
    },
    onPointerUp: (e: React.PointerEvent<HTMLDivElement>) => {
      const g = gesto.current;
      gesto.current = null;
      if (!g || g.id !== e.pointerId) return;
      const m = medir(e.clientX);
      if (!m) { setEstado(null); return; }
      // La lente se acomoda sobre el botón donde quedó, con un rebote, y se va.
      const centro = m.borde + m.celda * m.indice + m.celda / 2;
      setEstado((s) => (s ? { ...s, x: centro, indice: m.indice, soltando: true } : s));
      setTimeout(() => setEstado(null), 320);
      if (g.arrastra) {
        ignorarClic.current = true;
        setTimeout(() => { ignorarClic.current = false; }, 450);
        alSoltar(m.indice);
      }
    },
    onPointerCancel: () => {
      gesto.current = null;
      setEstado(null);
    },
    onClickCapture: (e: React.MouseEvent) => {
      if (ignorarClic.current) {
        e.preventDefault();
        e.stopPropagation();
      }
    },
  };

  return { barra, eventos, estado };
}

export function NavInferior({
  tipo = 'emprendedor', rubro = 'comercio', esAdmin = true, administraOrden = false,
}: {
  tipo?: TipoCuenta;
  rubro?: Rubro;
  esAdmin?: boolean;
  /**
   * El enlace al panel de Orden estaba SOLO en la barra lateral, que es
   * `lg:flex`: no existe en un celular. Quien administra desde el teléfono
   * no tenía cómo llegar más que escribiendo la dirección.
   *
   * Igual que en la lateral, solo se dibuja para quien ya está en
   * `superadmins`: un cliente no lo ve ni se entera de que existe.
   */
  administraOrden?: boolean;
}) {
  const ruta = usePathname();
  const router = useRouter();
  const t = useTextos();
  const [abierto, setAbierto] = useState(false);

  // Mientras el menú está adelante, la página de atrás no se mueve.
  useBloquearFondo(abierto);

  const enBarra = barraDe(tipo, rubro, esAdmin);
  const todos = itemsDe(t, tipo, rubro, esAdmin);
  // El orden de la barra manda sobre el orden del menú: en personal, Deudas
  // tiene que quedar donde estaba Vender y no al final.
  const fijos = enBarra
    .map((href) => todos.find((i) => i.href === href))
    .filter((i): i is ItemNav => Boolean(i));

  // «Más» se marca en verde cuando estás parado en una sección que no está
  // fija abajo. Si no, al entrar a Productos la barra no señalaría nada y
  // parecería que estás en ningún lado.
  const enOtraSeccion = !enBarra.some((href) => activo(ruta, href));

  // Dónde va la burbuja: la sección fija activa, o «Más» si estás en otra.
  const columnas = fijos.length + 1;
  const indiceActivo = abierto || enOtraSeccion
    ? fijos.length
    : fijos.findIndex((i) => activo(ruta, i.href));

  const lente = useLenteDeVidrio(columnas, (i) => {
    if (i < fijos.length) router.push(fijos[i].href);
    else setAbierto(true);
  });

  // El menú se cierra solo al navegar. Sin esto queda tapando la pantalla
  // a la que acabás de entrar.
  useEffect(() => { setAbierto(false); }, [ruta]);

  return (
    <>
      {abierto && (
        <div
          className="fixed inset-0 z-[60] flex touch-none items-center justify-center overscroll-none px-4 bg-noche/80 backdrop-blur-sm lg:hidden"
          style={{
            paddingTop: 'max(1rem, env(safe-area-inset-top))',
            paddingBottom: 'max(1rem, env(safe-area-inset-bottom))',
          }}
          onClick={() => setAbierto(false)}
        >
          {/*
            La hoja se desliza. En un celular chico, o en un idioma con
            palabras largas, las diez secciones no entran de una: sin scroll,
            la última fila queda escondida detrás de la barra y parece que no
            existe. `max-h` la limita a tres cuartos de pantalla y el grid se
            desplaza adentro.
          */}
          <div
            className="flex max-h-full w-full max-w-sm flex-col aparecer"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex shrink-0 items-center justify-between gap-3 px-1 pb-3">
              <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-white/55">
                {t.nav.todasLasSecciones}
              </p>
              {/* La salida. Con la barra escondida, sin esto la única forma
                  de volver sería tocar el fondo, y eso no lo adivina nadie. */}
              <button
                type="button"
                onClick={() => setAbierto(false)}
                aria-label={t.comun.cerrar}
                className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-white/10 text-white transition hover:bg-white/20 active:scale-95"
              >
                <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" {...trazo}>
                  <path d="M6 6l12 12M18 6 6 18" />
                </svg>
              </button>
            </div>

            {/*
              El relleno de abajo tiene que dejar pasar la barra de navegación
              ENTERA, que en pantallas angostas puede tener la etiqueta en dos
              líneas, más la franja del gesto del iPhone. Con menos, el último
              cuadro queda tapado justo cuando alguien lo va a tocar.
            */}
            <div
              className="grid min-h-0 touch-pan-y grid-cols-3 gap-2.5 overflow-y-auto overscroll-contain p-1"
            >
              {todos.map((i) => {
                const on = activo(ruta, i.href);
                return (
                  <Link
                    key={i.href}
                    href={i.href}
                    onClick={() => setAbierto(false)}
                    className={`flex min-h-[92px] flex-col items-center justify-center gap-1.5 rounded-2xl px-1 py-3 text-center text-[11.5px] font-bold leading-tight shadow-tarjeta transition active:scale-95 ${
                      on ? 'bg-verde-claro text-verde-fuerte' : 'bg-superficie text-tinta/70'
                    }`}
                  >
                    {i.icono}
                    <span className="px-0.5">{i.texto}</span>
                  </Link>
                );
              })}

              <Link
                href="/plan"
                onClick={() => setAbierto(false)}
                className={`flex min-h-[92px] flex-col items-center justify-center gap-1.5 rounded-2xl px-1 py-3 text-center text-[11.5px] font-bold leading-tight shadow-tarjeta transition active:scale-95 ${
                  activo(ruta, '/plan') ? 'bg-verde-claro text-verde-fuerte' : 'bg-superficie text-tinta/70'
                }`}
              >
                {Ico.plan}
                <span className="px-0.5">{t.nav.plan}</span>
              </Link>

              {/* Recomendar no es una sección del negocio: es un extra para
                  la persona. Va al lado del plan, que es el otro lugar donde
                  se habla de plata con Orden y no con los clientes. */}
              <Link
                href="/recomendar"
                onClick={() => setAbierto(false)}
                className={`flex min-h-[92px] flex-col items-center justify-center gap-1.5 rounded-2xl px-1 py-3 text-center text-[11.5px] font-bold leading-tight shadow-tarjeta transition active:scale-95 ${
                  activo(ruta, '/recomendar') ? 'bg-verde-claro text-verde-fuerte' : 'bg-superficie text-tinta/70'
                }`}
              >
                {Ico.recomendar}
                <span className="px-0.5">{t.nav.recomendar}</span>
              </Link>

              {administraOrden && (
                <Link
                  href="/admin"
                  onClick={() => setAbierto(false)}
                  className={`flex min-h-[92px] flex-col items-center justify-center gap-1.5 rounded-2xl px-1 py-3 text-center text-[11.5px] font-bold leading-tight shadow-tarjeta transition active:scale-95 ${
                    activo(ruta, '/admin') ? 'bg-verde-claro text-verde-fuerte' : 'bg-noche text-white'
                  }`}
                >
                  {Ico.orden}
                  <span className="px-0.5">{t.nav.panelOrden}</span>
                </Link>
              )}
            </div>
          </div>
        </div>
      )}

      {/*
        LA BARRA FLOTA, DE VIDRIO, COMO LA DE IPHONE (cuaderno de Matías).

        Se ve lo que pasa por detrás, desenfocado, y la burbuja de la sección
        activa se desliza de una a otra con un rebote chico. Los estilos
        están en globals.css (`.barra-vidrio`, `.barra-burbuja`).
      */}
      <nav
        className={`fixed inset-x-0 bottom-0 z-50 touch-none px-3 lg:hidden ${abierto ? 'hidden' : ''}`}
        style={{ paddingBottom: 'calc(10px + env(safe-area-inset-bottom))' }}
      >
        {/*
          Las columnas son las que HAY, no cinco fijas.

          Antes estaba escrito `grid-cols-5` a mano, y la cantidad de botones
          depende del rubro: un ganadero no tiene cierre del dia, asi que le
          quedaban cuatro botones repartidos en cinco columnas y una franja
          vacia a la derecha. Lo mismo a un vendedor de comercio, que no tiene
          agenda.
        */}
        <div
          ref={lente.barra}
          {...lente.eventos}
          className="barra-vidrio relative mx-auto grid max-w-md rounded-[30px] p-1.5"
          style={{ gridTemplateColumns: `repeat(${columnas}, minmax(0, 1fr))` }}
        >
          {indiceActivo >= 0 && (
            <span
              aria-hidden="true"
              className={`barra-burbuja pointer-events-none absolute bottom-1.5 left-1.5 top-1.5 transition-opacity ${
                lente.estado ? 'opacity-0' : ''
              }`}
              style={{
                width: `calc((100% - 12px) / ${columnas})`,
                transform: `translateX(${indiceActivo * 100}%)`,
              }}
            />
          )}

          {/* La lente de vidrio: aparece al mantener apretado y sigue el dedo. */}
          {lente.estado && (
            <span
              aria-hidden="true"
              className={`barra-lente ${lente.estado.soltando ? 'barra-lente-soltando' : ''}`}
              style={{ width: lente.estado.anchoLente, left: lente.estado.x - lente.estado.anchoLente / 2 }}
            >
              {/* Adentro, una copia de la barra agrandada y alineada con la de
                  abajo: eso es lo que hace que la lente «aumente» los íconos.
                  El vidrio de verdad dobla la luz; esto se ve igual y anda en
                  Safari, que no deja deformar lo de atrás. */}
              <span
                className="barra-lente-contenido grid p-1.5"
                style={{
                  width: lente.estado.anchoBarra,
                  height: lente.estado.altoBarra,
                  left: -(lente.estado.x - lente.estado.anchoLente / 2),
                  gridTemplateColumns: `repeat(${columnas}, minmax(0, 1fr))`,
                  transformOrigin: `${lente.estado.x}px 50%`,
                }}
              >
                {[...fijos.map((i) => ({ clave: i.href, icono: i.icono, texto: i.href === '/cierre' ? t.nav.cierreCorto : i.texto })),
                  { clave: 'mas', icono: Ico.mas, texto: t.nav.mas },
                ].map((x, n) => (
                  <span
                    key={x.clave}
                    className={`flex flex-col items-center gap-0.5 px-1 py-2 text-center text-[10.5px] font-bold leading-tight ${
                      n === lente.estado!.indice ? 'text-verde-fuerte' : 'text-tinta/55'
                    }`}
                  >
                    {x.icono}
                    {x.texto}
                  </span>
                ))}
              </span>
            </span>
          )}
          {fijos.map((i) => {
            // Con el menú abierto, la sección de atrás se apaga: mientras
            // estás eligiendo, estás en el menú y no en el panel. Dos luces
            // al mismo tiempo no dicen dónde estás, que es lo único que esta
            // barra tiene que decir.
            const on = activo(ruta, i.href) && !abierto;
            return (
              <Link
                key={i.href} href={i.href} draggable={false}
                className={`relative z-10 flex flex-col items-center gap-0.5 rounded-[24px] px-1 py-2 text-center text-[10.5px] font-bold leading-tight transition-colors active:scale-95 ${
                  on ? 'barra-activo text-verde-fuerte' : 'text-tinta/45'
                }`}
              >
                {i.icono}
                {/* Etiqueta corta solo acá abajo: «Cierre del día» se partía
                    en dos líneas, hacía la barra más alta que el resto y
                    empujaba la hoja de «Más» fuera de la pantalla. */}
                {i.href === '/cierre' ? t.nav.cierreCorto : i.texto}
              </Link>
            );
          })}

          <button
            type="button"
            onClick={() => setAbierto((v) => !v)}
            aria-expanded={abierto}
            aria-label={t.nav.todasLasSecciones}
            className={`relative z-10 flex flex-col items-center gap-0.5 rounded-[24px] px-1 py-2 text-center text-[10.5px] font-bold leading-tight transition-colors active:scale-95 ${
              abierto || enOtraSeccion ? 'barra-activo text-verde-fuerte' : 'text-tinta/45'
            }`}
          >
            {Ico.mas}
            {t.nav.mas}
          </button>
        </div>
      </nav>
    </>
  );
}

export function BarraSuperior({
  empresa, empresas, nombreUsuario, rol,
}: {
  empresa: Empresa;
  empresas: { empresa: Empresa; rol: string }[];
  nombreUsuario: string;
  rol: string;
}) {
  const router = useRouter();
  const ruta = usePathname();
  const t = useTextos();
  const [abierto, setAbierto] = useState(false);
  // Con el rubro de la cuenta: sin esto el título decía «Productos» aunque
  // el menú de al lado dijera «Hacienda», y parecían dos pantallas distintas.
  const titulo = itemsDe(t, empresa.tipo_cuenta, empresa.rubro)
    .find((i) => activo(ruta, i.href))?.texto
    ?? (activo(ruta, '/recomendar') ? t.nav.recomendar : 'Orden');

  function cambiar(id: string) {
    document.cookie = `${COOKIE_EMPRESA}=${id}; path=/; max-age=${60 * 60 * 24 * 365}; samesite=lax`;
    setAbierto(false);
    router.refresh();
  }

  async function salir() {
    const supabase = clienteNavegador();
    await supabase.auth.signOut();
    router.push('/ingresar');
    router.refresh();
  }

  return (
    <header className="zona-segura-arriba sticky top-0 z-30">
      {/* El vidrio va en una capa aparte y no en el header: un header con
          backdrop-filter se vuelve el marco de sus hijos «fixed», y el velo
          que cierra el menú al tocar afuera cubría solo el header. */}
      <span aria-hidden className="pointer-events-none absolute inset-0 -z-10 bg-arena/85 backdrop-blur-xl" />
      <div className="flex items-center justify-between gap-3 px-4 py-2.5 lg:px-7">
        <div className="relative flex min-w-0 items-center gap-3">
          {/* Como en Wise: arriba a la izquierda, la persona. Tocarla abre su
              cuenta (cambiar de negocio, sumarse a otro, salir). */}
          <button
            type="button" onClick={() => setAbierto((v) => !v)}
            aria-label={nombreUsuario || t.nav.miCuenta}
            aria-expanded={abierto}
            className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-superficie text-[14px] font-bold text-tinta ring-1 ring-borde transition active:scale-95"
          >
            {iniciales(nombreUsuario)}
          </button>
          <h1 className="truncate font-titulo text-[21px] font-extrabold tracking-tight lg:text-[23px]">{titulo}</h1>

          {abierto && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setAbierto(false)} />
              <div className="absolute left-0 top-full z-50 mt-2 w-64 overflow-hidden rounded-3xl border border-borde bg-superficie shadow-[0_18px_40px_-18px_rgba(0,0,0,.35)] aparecer">
                <div className="border-b border-borde px-4 py-3">
                  <p className="text-[13px] font-bold">{nombreUsuario || t.nav.miCuenta}</p>
                  <p className="mt-0.5 truncate text-[12px] text-tinta/50">{empresa.nombre}</p>
                  {/* El código de invitación NO se muestra acá: vive en Ajustes y
                      solo lo ve quien administra. La base tampoco se lo entrega
                      a un vendedor aunque manipule el navegador. */}
                  <p className="mt-0.5 text-[12px] capitalize text-tinta/50">{rol}</p>
                </div>

                <div className="border-b border-borde py-1.5">
                  {empresas.length > 1 && (
                    <>
                      <p className="px-4 py-1 text-[10.5px] font-bold uppercase tracking-wider text-tinta/40">{t.nav.cambiarEmpresa}</p>
                      {empresas.map(({ empresa: e }) => (
                      <button
                        key={e.id} onClick={() => cambiar(e.id)}
                        className={`flex w-full items-center justify-between px-4 py-2 text-left text-[13.5px] font-semibold hover:bg-arena ${
                          e.id === empresa.id ? 'text-verde-fuerte' : 'text-tinta/70'
                        }`}
                      >
                        <span className="truncate">{e.nombre}</span>
                        {e.id === empresa.id && <span className="text-[11px]">{t.nav.activa}</span>}
                      </button>
                      ))}
                    </>
                  )}

                  {/* La puerta para sumarse a otro negocio con un código.
                      Antes solo existía para quien no tenía NINGUNA empresa:
                      a quien ya usaba Orden —el barbero que lleva sus
                      finanzas personales y cuyo jefe le pasa el código— no le
                      quedaba ningún lugar donde escribirlo. El código
                      funcionaba; lo que faltaba era la puerta. */}
                  <Link
                    href="/empezar"
                    className="block w-full px-4 py-2.5 text-left text-[13.5px] font-semibold text-verde-fuerte hover:bg-arena"
                  >
                    {t.nav.sumarmeAOtro}
                  </Link>
                </div>

                <button onClick={salir} className="w-full px-4 py-2.5 text-left text-[13.5px] font-semibold text-rojo hover:bg-rojo-claro">
                  {t.nav.salir}
                </button>
              </div>
            </>
          )}
        </div>

        {/* Recomendar, siempre a la vista, como «Gana 50» en Wise: quien ya
            usa Orden es el que mejor lo vende, y el lugar fijo le recuerda
            que se gana la mitad del primer pago de cada negocio que trae. */}
        <Link
          href="/recomendar"
          aria-label={t.nav.ganarDetalle}
          className="flex shrink-0 items-center gap-1.5 rounded-full bg-verde-claro px-3.5 py-2 text-[13px] font-bold text-verde-fuerte transition active:scale-95"
        >
          <svg viewBox="0 0 24 24" className="h-4 w-4" {...trazo} strokeWidth={2}>
            <rect x="3.5" y="8" width="17" height="4" rx="1" /><path d="M5 12v8h14v-8M12 8v12" />
            <path d="M12 8c-1.2-2.6-4.5-3.4-4.5-1.2C7.5 8 10 8 12 8Zm0 0c1.2-2.6 4.5-3.4 4.5-1.2C16.5 8 14 8 12 8Z" />
          </svg>
          {t.nav.ganar}
        </Link>
      </div>
    </header>
  );
}

/** «Matías Aranda» → «MA»; un solo nombre → su primera letra. */
function iniciales(nombre: string) {
  const partes = (nombre || '').trim().split(/\s+/).filter(Boolean);
  if (partes.length === 0) return 'U';
  const letras = partes.length === 1 ? partes[0].charAt(0) : partes[0].charAt(0) + partes[partes.length - 1].charAt(0);
  return letras.toUpperCase();
}
