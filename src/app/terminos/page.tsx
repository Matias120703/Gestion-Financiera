import type { Metadata } from 'next';
import { idiomaActual } from '@/i18n';
import { FICHA } from '@/i18n/idiomas';
import { legalDe, type DatosPremiumLegal } from '@/i18n/textos/legal';
import { precio as precioTexto } from '@/lib/formato';
import { LIMITES_VISIBLES, PERSONAS_INCLUIDAS_PREMIUM, monedaDeCobro } from '@/lib/precios';
import { clienteServidor } from '@/lib/supabase/servidor';
import type { Precio } from '@/lib/tipos';
import { VistaLegal } from './VistaLegal';

/**
 * TÉRMINOS DEL SERVICIO
 *
 * Escritos para que se entiendan. Un texto legal que la persona no puede leer
 * no la protege ni te protege: si el día que hay un problema nadie sabía qué
 * decía, no sirvió de nada.
 *
 * Los textos viven en `src/i18n/textos/legal.ts`, en español y en portugués,
 * con la lista de dónde sale cada frase (prueba, planes por rubro, cuenta
 * pausada, cobro, comisión). La tabla de planes de cada rubro no se escribe:
 * la arma `VistaLegal` con `FichaRubro.planes`.
 *
 * Ya no es `force-static`: el idioma sale de la cookie o del navegador de
 * quien mira, y una página estática lo leería siempre vacío (español).
 *
 * EL PREMIUM, CON SUS NÚMEROS (123, 02/10/2026). Cuánto cuesta y cuánto suma
 * cada persona de más se leen de la base (`lista_precios` y
 * `precio_por_vendedor`), igual que en la portada: un importe escrito a mano
 * en un documento legal sería el primero en quedar viejo. Si la lectura
 * falla, el párrafo se dice sin importes y la página se ve igual.
 *
 * NO SOY ABOGADO. Antes de crecer, que un profesional lo revise contra la ley
 * de cada país — sobre todo responsabilidad y defensa del consumidor.
 */
export async function generateMetadata(): Promise<Metadata> {
  const d = legalDe(await idiomaActual()).terminos;
  return { title: d.metaTitulo, description: d.metaDescripcion };
}

export default async function Terminos() {
  const idioma = await idiomaActual();
  const l = legalDe(idioma);
  return <VistaLegal l={l} d={l.terminos} idioma={idioma} premium={await datosDelPremium(idioma)} />;
}

async function datosDelPremium(idioma: string): Promise<DatosPremiumLegal> {
  const datos: DatosPremiumLegal = {
    precio: null,
    porPersona: null,
    incluidas: PERSONAS_INCLUIDAS_PREMIUM,
    tope: LIMITES_VISIBLES.negocio.miembros,
  };
  try {
    const supabase = clienteServidor();
    const moneda = monedaDeCobro();
    const locale = FICHA[idioma === 'pt' ? 'pt' : 'es'].locale;
    const [{ data: lista }, { data: porVendedor }] = await Promise.all([
      supabase.rpc('lista_precios', { p_moneda: moneda, p_tipo: 'emprendedor' }),
      supabase.rpc('precio_por_vendedor', { p_moneda: moneda }),
    ]);
    const fila = (Array.isArray(lista) ? lista as Precio[] : [])
      .find((x) => x.tipo_cuenta === 'emprendedor' && x.plan === 'negocio' && x.periodo === 'mensual');
    const escrito = (v: unknown) => {
      const n = v == null ? NaN : Number(v);
      return Number.isFinite(n) && n > 0 ? precioTexto(n, moneda, locale) : null;
    };
    datos.precio = escrito(fila?.importe);
    datos.porPersona = escrito(porVendedor);
  } catch {
    // Sin la base, el párrafo se dice sin importes.
  }
  return datos;
}
