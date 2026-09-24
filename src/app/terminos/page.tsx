import type { Metadata } from 'next';
import { idiomaActual } from '@/i18n';
import { legalDe } from '@/i18n/textos/legal';
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
  return <VistaLegal l={l} d={l.terminos} idioma={idioma} />;
}
