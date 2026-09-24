import type { Metadata } from 'next';
import { idiomaActual } from '@/i18n';
import { legalDe } from '@/i18n/textos/legal';
import { VistaLegal } from '../terminos/VistaLegal';

/**
 * POLÍTICA DE PRIVACIDAD
 *
 * Escrita sobre lo que Orden REALMENTE hace, no copiada de una plantilla. Los
 * textos viven en `src/i18n/textos/legal.ts` (español y portugués), con la
 * lista de dónde sale cada afirmación: los datos del alta, lo que se le manda
 * a OpenAI, dónde está la base, lo que ve la administración, el borrado de
 * `borrar_datos_de_usuario()` (014) y las reglas de rutinas y medidas (098,
 * 099, y la hoja «Progreso» del Excel de la 106).
 *
 * Si mañana se agrega un proveedor —otra pasarela, otro servicio de correo—
 * hay que tocar legal.ts en el mismo cambio. Una política que no dice la
 * verdad es peor que no tenerla.
 *
 * Ya no es `force-static`: el idioma depende de quien mira.
 *
 * NO SOY ABOGADO. Esto cubre lo que hace el sistema con honestidad, pero
 * antes de crecer conviene que un profesional lo revise contra la ley que
 * aplique (en Paraguay, la Ley 7593/2025; en Brasil, la LGPD).
 */
export async function generateMetadata(): Promise<Metadata> {
  const d = legalDe(await idiomaActual()).privacidad;
  return { title: d.metaTitulo, description: d.metaDescripcion };
}

export default async function Privacidad() {
  const idioma = await idiomaActual();
  const l = legalDe(idioma);
  return <VistaLegal l={l} d={l.privacidad} idioma={idioma} />;
}
