import type OpenAI from 'openai';

/**
 * PASAR UNA NOTA DE VOZ A TEXTO
 *
 * Lo usan la captura de movimientos y el dictado de turnos. Vivía adentro de
 * la ruta de la captura, y una ruta de Next no puede exportar nada más que
 * sus métodos: para que el dictado lo use sin copiarlo, vive acá.
 */

/**
 * El modelo que escucha.
 *
 * `gpt-4o-mini-transcribe` transcribe bastante más rápido que `whisper-1`, y
 * la espera del audio es la que más se siente: la persona ya habló y está
 * mirando la pantalla. Si por lo que sea no estuviera disponible, se cae solo
 * a whisper (ver `transcribir`), así que cambiarlo no puede romper la captura.
 */
const MODELO_AUDIO = process.env.MODELO_AUDIO || 'gpt-4o-mini-transcribe';
const MODELO_AUDIO_RESPALDO = 'whisper-1';

/**
 * Transcribe, y si el modelo rápido no está disponible usa whisper.
 *
 * El respaldo existe porque el modelo por defecto se puede cambiar por
 * variable de entorno y porque los nombres de modelo cambian con el tiempo.
 * Que una captura por voz falle entera por eso sería absurdo: whisper es más
 * lento, pero anda.
 *
 * `pista` es lo que se le dice al modelo antes de escuchar: qué clase de
 * cosas va a oír. Con ella, «150 lucas» sale como un monto y «a las tres»
 * como una hora.
 */
export async function transcribir(openai: OpenAI, archivo: File, pista: string): Promise<string> {
  try {
    const t = await openai.audio.transcriptions.create({
      file: archivo, model: MODELO_AUDIO, language: 'es', prompt: pista,
    });
    return (t.text ?? '').trim();
  } catch (e: any) {
    if (MODELO_AUDIO === MODELO_AUDIO_RESPALDO) throw e;
    console.warn('[transcribir] audio con', MODELO_AUDIO, 'falló; voy con whisper:', e?.message);
    const t = await openai.audio.transcriptions.create({
      file: archivo, model: MODELO_AUDIO_RESPALDO, language: 'es', prompt: pista,
    });
    return (t.text ?? '').trim();
  }
}
