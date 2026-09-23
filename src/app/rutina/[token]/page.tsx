import type { Metadata } from 'next';
import { clienteServidor } from '@/lib/supabase/servidor';
import { RutinaDelCliente } from '@/components/rutinas/RutinaDelCliente';
import { limpiarRutinaPublica } from '@/components/rutinas/publico/datos';
import { esTokenDeRutina, rutaDeRutina } from '@/components/rutinas/publico/enlace';
import type { RutinaPublica } from '@/lib/tipos-rutinas';
import { idiomaActual, textos } from '@/i18n';

export const dynamic = 'force-dynamic';

type Props = { params: Promise<{ token: string }> };

/**
 * LA RUTINA DEL CLIENTE · lo que abre desde el WhatsApp del trainer (098).
 *
 * Vive fuera de `(app)`, como /turno/[token]: sin menú, sin sesión y sin las
 * palabras del oficio. Quien entra es el cliente del trainer, que no usa
 * Orden y no tiene por qué enterarse de que hay un sistema detrás.
 *
 * El token ES la credencial. Por eso `rutina_por_token` devuelve lo justo
 * —el negocio, el nombre de pila y la rutina vigente— y nunca el teléfono,
 * el apellido, «Salud y lesiones», las medidas ni la plata. Y por eso la
 * respuesta se vuelve a recortar acá (publico/datos.ts) antes de viajar al
 * navegador: lo que no está en `RutinaPublica` no llega al HTML.
 *
 * Un token que no es un uuid ni se le pregunta a la base: termina en el
 * mismo «este link ya no está activo» que uno apagado o inexistente.
 * Distinguirlos le diría a quien prueba links cuál existió.
 */
async function traer(token: string): Promise<RutinaPublica | null> {
  if (!esTokenDeRutina(token)) return { existe: false };
  try {
    const { data, error } = await clienteServidor().rpc('rutina_por_token', { p_token: token });
    // Un error de la base no es un link inactivo: null muestra «no pudimos
    // cargar tu rutina» con un botón para probar de nuevo, en vez de
    // mandarlo a pedirle un link nuevo al entrenador por un corte de un minuto.
    if (error) return null;
    return limpiarRutinaPublica(data ?? { existe: false });
  } catch {
    return null;
  }
}

/**
 * La vista previa de WhatsApp y la pestaña del navegador.
 *
 * El título es genérico a propósito: WhatsApp lo muestra a todo el chat,
 * también en un grupo, y ahí no va el nombre del cliente. Sin índice ni
 * seguimiento de links, y sin `Referer`: al tocar «Ver cómo se hace», ni
 * YouTube ni Instagram se enteran de la dirección, que es la llave.
 *
 * El manifest propio es lo que hace que «Agregar a la pantalla de inicio»
 * guarde ESTA rutina con el nombre «Mi rutina», y no el ícono de Orden que
 * abre el login (el que declara el layout raíz). El idioma va en la
 * dirección porque el navegador pide el manifest sin cookies.
 */
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { token } = await params;
  const [t, idioma, datos] = await Promise.all([textos(), idiomaActual(), traer(token)]);
  const r = t.rutinaPublica;
  const negocio = datos?.existe ? datos.negocio.trim() : '';
  const titulo = negocio ? r.metaTitulo(negocio) : r.metaTituloSolo;

  return {
    title: titulo,
    description: r.metaDescripcion,
    openGraph: { title: titulo, description: r.metaDescripcion },
    robots: { index: false, follow: false, googleBot: { index: false, follow: false } },
    referrer: 'no-referrer',
    applicationName: r.nombreApp,
    manifest: esTokenDeRutina(token)
      ? `${rutaDeRutina(token)}/manifest.webmanifest?idioma=${idioma}`
      : null,
    appleWebApp: { capable: true, title: r.nombreApp, statusBarStyle: 'black-translucent' },
  };
}

export default async function PaginaRutina({ params }: Props) {
  const { token } = await params;
  const datos = await traer(token);
  return <RutinaDelCliente token={token} datos={datos} />;
}
