import Link from 'next/link';
import { Apartado, Lista, PaginaLegal } from '@/components/PaginaLegal';
import type { Idioma } from '@/i18n';
import {
  partesDeTexto, type BloqueLegal, type DocumentoLegal, type TextosLegal,
} from '@/i18n/textos/legal';
import { DIAS_DE_PRUEBA } from '@/lib/constantes';
import { LISTA_RUBROS, rubroVisible, type PlanDeRubro } from '@/lib/rubros';

/**
 * CÓMO SE PINTAN /terminos Y /privacidad (24/09/2026).
 *
 * Las dos páginas son lo mismo con otro texto: arriba lo esencial en cinco
 * renglones, un índice plegado para ir directo a lo que importa (en el
 * celular, quince títulos abiertos son una pantalla y media de enlaces), y
 * los apartados con su ancla. Vive acá y no en cada `page.tsx` porque una
 * página de Next no puede exportar otra cosa que lo suyo.
 *
 * Servidor puro: no hay nada que hidratar. El índice es un `<details>`, que
 * se abre y se cierra sin JavaScript y lo entiende cualquier lector de
 * pantalla.
 */
export function VistaLegal({ l, d, idioma }: { l: TextosLegal; d: DocumentoLegal; idioma: Idioma }) {
  return (
    <PaginaLegal titulo={d.titulo} actualizado={d.actualizado}>
      <p className="text-[16px] leading-relaxed text-tinta/75">{d.bajada}</p>

      <section aria-labelledby="lo-esencial" className="tarjeta border-verde/30 bg-verde-claro/40 p-5">
        <h2 id="lo-esencial" className="text-[15px] font-bold text-verde-fuerte">{d.esencialTitulo}</h2>
        <ul className="mt-3 space-y-2.5">
          {d.esencial.map((texto, i) => (
            <li key={i} className="flex items-start gap-2.5 text-[15px] leading-relaxed text-tinta/80">
              <svg viewBox="0 0 24 24" aria-hidden="true" className="mt-[3px] h-[18px] w-[18px] shrink-0 text-verde-fuerte"
                   fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round">
                <path d="M5 12.5l4.5 4.5L19 7.5" />
              </svg>
              <span><Texto texto={texto} /></span>
            </li>
          ))}
        </ul>
      </section>

      <details className="group tarjeta px-5">
        <summary className="flex min-h-[48px] cursor-pointer list-none items-center justify-between gap-3 text-[15px] font-semibold [&::-webkit-details-marker]:hidden">
          {l.indice}
          <svg viewBox="0 0 24 24" aria-hidden="true"
               className="h-5 w-5 shrink-0 text-tinta/45 transition-transform motion-reduce:transition-none group-open:rotate-180"
               fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
            <path d="M6 9l6 6 6-6" />
          </svg>
        </summary>
        <ol className="grid gap-x-6 pb-3 sm:grid-cols-2">
          {d.apartados.map((a) => (
            <li key={a.id}>
              <a href={`#${a.id}`} className="flex min-h-[44px] items-center text-[14.5px] font-semibold text-verde-fuerte hover:underline">
                {a.titulo}
              </a>
            </li>
          ))}
        </ol>
      </details>

      {d.apartados.map((a) => (
        <div key={a.id} id={a.id} className="scroll-mt-6">
          <Apartado titulo={a.titulo}>
            {a.bloques.map((b, i) => <Bloque key={i} bloque={b} l={l} idioma={idioma} />)}
          </Apartado>
        </div>
      ))}
    </PaginaLegal>
  );
}

function Bloque({ bloque, l, idioma }: { bloque: BloqueLegal; l: TextosLegal; idioma: Idioma }) {
  if (typeof bloque === 'string') return <p><Texto texto={bloque} /></p>;
  if ('lista' in bloque) return <Lista items={bloque.lista.map((t, i) => <Texto key={i} texto={t} />)} />;
  if (bloque.especial === 'planesPorRubro') return <PlanesPorRubro l={l} idioma={idioma} />;
  return <BotonContacto l={l} />;
}

function Texto({ texto }: { texto: string }) {
  return (
    <>
      {partesDeTexto(texto).map((p, i) => (
        p.enlace ? (
          <Link key={i} href={p.enlace} className="font-semibold text-verde-fuerte underline">{p.texto}</Link>
        ) : p.negrita ? (
          <strong key={i} className="text-tinta">{p.texto}</strong>
        ) : (
          <span key={i}>{p.texto}</span>
        )
      ))}
    </>
  );
}

/**
 * Qué planes ve cada rubro y en cuál arranca su prueba. Nada escrito a mano:
 * los planes salen de `FichaRubro.planes` (espejo de `planes_de_rubro()`,
 * 102) y el de la prueba con la regla de `plan_de_prueba()`: Pro si el rubro
 * lo ofrece; si no, el más alto de su lista. Si mañana cambia la tabla, esto
 * lo dice solo.
 */
function PlanesPorRubro({ l, idioma }: { l: TextosLegal; idioma: Idioma }) {
  const nombre = (p: PlanDeRubro) => l.tabla.nombresPlanes[p];
  const planDePrueba = (planes: readonly PlanDeRubro[]): PlanDeRubro =>
    planes.includes('pro') ? 'pro' : planes[planes.length - 1];

  const filas = [
    ...LISTA_RUBROS.map((f) => ({
      clave: f.clave as string,
      rubro: rubroVisible(f, idioma).nombre,
      planes: f.planes.map(nombre).join(' · '),
      prueba: l.tabla.pruebaDe(nombre(planDePrueba(f.planes)), DIAS_DE_PRUEBA.emprendedor),
    })),
    {
      clave: 'personal',
      rubro: l.tabla.cuentaPersonal,
      planes: l.tabla.planPersonal,
      prueba: l.tabla.pruebaDe(l.tabla.nombrePlanPersonal, DIAS_DE_PRUEBA.personal),
    },
  ];

  return (
    <div className="overflow-hidden rounded-2xl border border-borde">
      <table className="w-full border-collapse text-left text-[14px]">
        <thead className="bg-arena/40 text-[12.5px] font-semibold text-tinta/55">
          <tr>
            <th scope="col" className="px-3.5 py-2.5">{l.tabla.rubro}</th>
            <th scope="col" className="px-3.5 py-2.5">{l.tabla.planes}</th>
            <th scope="col" className="hidden px-3.5 py-2.5 sm:table-cell">{l.tabla.prueba}</th>
          </tr>
        </thead>
        <tbody>
          {filas.map((f) => (
            <tr key={f.clave} className="border-t border-borde align-top">
              <th scope="row" className="px-3.5 py-2.5 font-semibold text-tinta">{f.rubro}</th>
              <td className="px-3.5 py-2.5 text-tinta/75">
                {f.planes}
                {/* En el celular no entran tres columnas: la prueba va abajo. */}
                <span className="mt-0.5 block text-[12.5px] text-tinta/50 sm:hidden">
                  {l.tabla.prueba}: {f.prueba}
                </span>
              </td>
              <td className="hidden px-3.5 py-2.5 text-tinta/75 sm:table-cell">{f.prueba}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/**
 * El WhatsApp de Orden, si hay uno configurado: el de soporte y, si no, el
 * mismo del cobro (el que abre /plan). Sin número no se muestra nada: un
 * botón que no lleva a ningún lado es peor que ninguno.
 */
function BotonContacto({ l }: { l: TextosLegal }) {
  const numero = (process.env.NEXT_PUBLIC_WHATSAPP_SOPORTE || process.env.NEXT_PUBLIC_WHATSAPP || '').replace(/\D/g, '');
  if (!numero) return null;
  return (
    <p>
      <a
        href={`https://wa.me/${numero}?text=${encodeURIComponent(l.contacto.mensaje)}`}
        target="_blank"
        rel="noreferrer"
        className="boton-suave min-h-[44px]"
      >
        {l.contacto.whatsapp}
      </a>
    </p>
  );
}
