'use client';

/**
 * Subir, listar y borrar comprobantes desde el navegador.
 *
 * El orden de las operaciones no es casual:
 *
 *   AL SUBIR   archivo primero, fila después. Si falla la fila, queda un
 *              archivo suelto que nadie ve (y que se limpia solo cuando se
 *              borra la empresa). Al revés quedaría una fila apuntando a un
 *              archivo que no existe: un comprobante roto en pantalla.
 *
 *   AL BORRAR  fila primero, archivo después, por el mismo motivo dado vuelta.
 *
 * La ruta es `empresa_id/movimiento_id/archivo`. La primera carpeta es lo que
 * mira la policy de storage.objects, y la función `adjuntar()` verifica que
 * el prefijo coincida: sin eso se podría colgar el comprobante de una venta
 * de otra.
 */
import { clienteNavegador } from './supabase/cliente';
import { comprimirFoto } from './imagen';
import type { Adjunto } from './tipos';

const BUCKET = 'comprobantes';
/** Cuánto vive el enlace de una foto. Corto porque se pide de nuevo al abrir. */
const SEGUNDOS_FIRMA = 60 * 10;

function nombreSeguro(nombre: string): string {
  // Storage rechaza rutas con caracteres raros, y los celulares ponen de
  // todo en el nombre del archivo.
  const limpio = nombre.normalize('NFKD').replace(/[^\w.-]+/g, '-').toLowerCase();
  return limpio.slice(-60) || 'foto.webp';
}

export async function subirComprobante(
  { empresaId, movimientoId, archivo, texto = '' }:
  { empresaId: string; movimientoId: string; archivo: File; texto?: string },
): Promise<Adjunto> {
  const supabase = clienteNavegador();
  const { archivo: liviano } = await comprimirFoto(archivo);

  const ruta = `${empresaId}/${movimientoId}/${Date.now()}-${nombreSeguro(liviano.name)}`;

  const { error: errorSubida } = await supabase.storage
    .from(BUCKET)
    .upload(ruta, liviano, { contentType: liviano.type, upsert: false });

  if (errorSubida) throw new Error(errorSubida.message);

  const { data, error } = await supabase.rpc('adjuntar', {
    p_movimiento: movimientoId,
    p_tipo: 'foto',
    p_ruta: ruta,
    p_mime: liviano.type,
    p_bytes: liviano.size,
    p_texto: texto.slice(0, 2000),
  });

  if (error) {
    // La fila no se creó: el archivo que acabamos de subir no le sirve a
    // nadie. Se limpia acá mismo para no dejar basura pagando storage.
    await supabase.storage.from(BUCKET).remove([ruta]).catch(() => null);
    throw new Error(error.message);
  }

  return {
    id: String(data),
    tipo: 'foto',
    ruta,
    mime: liviano.type,
    bytes: liviano.size,
    texto,
    creado_por: null,
    created_at: new Date().toISOString(),
  };
}

/** Guarda lo que se dijo en una nota de voz. El audio no se guarda: ver la 007. */
export async function guardarTranscripcion(movimientoId: string, texto: string): Promise<void> {
  const limpio = texto.trim();
  if (!limpio) return;

  const supabase = clienteNavegador();
  const { error } = await supabase.rpc('adjuntar', {
    p_movimiento: movimientoId,
    p_tipo: 'audio',
    p_ruta: null,
    p_mime: null,
    p_bytes: 0,
    p_texto: limpio.slice(0, 2000),
  });
  if (error) throw new Error(error.message);
}

export async function traerAdjuntos(movimientoId: string): Promise<Adjunto[]> {
  const supabase = clienteNavegador();
  const { data, error } = await supabase.rpc('adjuntos_de', { p_movimiento: movimientoId });
  if (error) throw new Error(error.message);
  return (Array.isArray(data) ? data : []) as Adjunto[];
}

/**
 * URL temporal para mostrar una foto. El bucket es privado: sin firma no se
 * ve, y la firma solo la da Storage si la policy deja pasar a quien pregunta.
 */
export async function urlDeComprobante(ruta: string): Promise<string | null> {
  const supabase = clienteNavegador();
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(ruta, SEGUNDOS_FIRMA);
  if (error) return null;
  return data?.signedUrl ?? null;
}

export async function borrarAdjunto(id: string): Promise<void> {
  const supabase = clienteNavegador();
  const { data, error } = await supabase.rpc('borrar_adjunto', { p_adjunto: id });
  if (error) throw new Error(error.message);

  // La función devuelve la ruta del archivo que quedó sin dueño.
  const ruta = typeof data === 'string' ? data : null;
  if (ruta) await supabase.storage.from(BUCKET).remove([ruta]);
}
